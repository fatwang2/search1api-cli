import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

async function startOAuthFixture() {
  const calls = {
    authorization: [],
    codeExchange: [],
    refresh: [],
    registration: [],
    usageTokens: [],
  };

  let baseUrl = "";
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", baseUrl);

    if (requestUrl.pathname === "/.well-known/oauth-protected-resource") {
      json(res, 200, {
        resource: baseUrl,
        authorization_servers: [baseUrl],
      });
      return;
    }

    if (
      requestUrl.pathname === "/.well-known/oauth-authorization-server"
    ) {
      json(res, 200, {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code", "refresh_token"],
      });
      return;
    }

    if (requestUrl.pathname === "/oauth/register" && req.method === "POST") {
      const registration = JSON.parse(await readBody(req));
      calls.registration.push(registration);
      json(res, 201, {
        client_id: "client_search1api_cli",
        token_endpoint_auth_method: "none",
      });
      return;
    }

    if (requestUrl.pathname === "/oauth/authorize") {
      const authorization = Object.fromEntries(requestUrl.searchParams);
      calls.authorization.push(authorization);
      const callback = new URL(authorization.redirect_uri);
      callback.searchParams.set("code", "authorization_code_123");
      callback.searchParams.set("state", authorization.state);
      res.writeHead(302, { Location: callback.toString() });
      res.end();
      return;
    }

    if (requestUrl.pathname === "/oauth/token" && req.method === "POST") {
      const tokenRequest = Object.fromEntries(
        new URLSearchParams(await readBody(req))
      );

      if (tokenRequest.grant_type === "authorization_code") {
        calls.codeExchange.push(tokenRequest);
        const authorization = calls.authorization.at(-1);
        const actualChallenge = createHash("sha256")
          .update(tokenRequest.code_verifier)
          .digest("base64url");
        if (
          tokenRequest.code !== "authorization_code_123" ||
          actualChallenge !== authorization.code_challenge
        ) {
          json(res, 400, { error: "invalid_grant" });
          return;
        }
        json(res, 200, {
          access_token: "oauth_access_initial",
          refresh_token: "oauth_refresh_123",
          expires_in: 300,
          token_type: "Bearer",
          scope: "openid profile email offline_access",
        });
        return;
      }

      if (tokenRequest.grant_type === "refresh_token") {
        calls.refresh.push(tokenRequest);
        if (
          tokenRequest.refresh_token !== "oauth_refresh_123" ||
          tokenRequest.client_id !== "client_search1api_cli"
        ) {
          json(res, 400, { error: "invalid_grant" });
          return;
        }
        json(res, 200, {
          access_token: "oauth_access_refreshed",
          expires_in: 300,
          token_type: "Bearer",
          scope: "openid profile email offline_access",
        });
        return;
      }
    }

    if (requestUrl.pathname === "/usage") {
      const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      calls.usageTokens.push(token);
      if (token === "oauth_access_stale") {
        json(res, 401, { error: "expired_token" });
        return;
      }
      if (
        token === "oauth_access_initial" ||
        token === "oauth_access_refreshed" ||
        token === "legacy_api_key"
      ) {
        json(res, 200, { credential: token, usage: 88 });
        return;
      }
      json(res, 401, { error: "invalid_token" });
      return;
    }

    json(res, 404, { error: "not_found" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    calls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("runs browser OAuth, PKCE, refresh, retry, and API-key fallback end to end", async () => {
  const fixture = await startOAuthFixture();
  const configDir = mkdtempSync(join(tmpdir(), "search1api-oauth-e2e-"));
  process.env.SEARCH1API_API_BASE = fixture.baseUrl;
  process.env.SEARCH1API_OAUTH_RESOURCE_METADATA =
    `${fixture.baseUrl}/.well-known/oauth-protected-resource`;
  process.env.SEARCH1API_CONFIG_DIR = configDir;
  delete process.env.SEARCH1API_KEY;

  try {
    const auth = await import("../dist/auth.js");
    const config = await import("../dist/config.js");
    let authorizationRequest;

    const login = await auth.loginWithBrowser({
      openBrowser: false,
      timeoutMs: 5_000,
      onReady: ({ authUrl }) => {
        authorizationRequest = fetch(authUrl);
      },
    });
    const callbackResponse = await authorizationRequest;

    assert.equal(callbackResponse.status, 200);
    assert.match(await callbackResponse.text(), /Authorization complete/);
    assert.equal(login.oauth.accessToken, "oauth_access_initial");
    assert.equal(login.oauth.refreshToken, "oauth_refresh_123");
    assert.equal(login.oauth.clientId, "client_search1api_cli");
    assert.deepEqual(config.loadConfig().oauthClient, {
      clientId: "client_search1api_cli",
      issuer: fixture.baseUrl,
      redirectUri: login.details.callbackUrl,
    });

    assert.equal(fixture.calls.registration.length, 1);
    assert.deepEqual(fixture.calls.registration[0].grant_types, [
      "authorization_code",
      "refresh_token",
    ]);
    assert.equal(
      fixture.calls.registration[0].token_endpoint_auth_method,
      "none"
    );
    assert.equal(
      fixture.calls.registration[0].scope,
      "openid profile email offline_access"
    );
    assert.match(
      fixture.calls.registration[0].redirect_uris[0],
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/
    );
    assert.equal(fixture.calls.authorization[0].code_challenge_method, "S256");
    assert.equal(fixture.calls.codeExchange.length, 1);
    assert.equal(
      fixture.calls.codeExchange[0].redirect_uri,
      fixture.calls.registration[0].redirect_uris[0]
    );

    let repeatedAuthorizationRequest;
    const repeatedLogin = await auth.loginWithBrowser({
      openBrowser: false,
      timeoutMs: 5_000,
      onReady: ({ authUrl }) => {
        repeatedAuthorizationRequest = fetch(authUrl);
      },
    });
    assert.equal((await repeatedAuthorizationRequest).status, 200);
    assert.equal(repeatedLogin.oauth.clientId, "client_search1api_cli");
    assert.equal(repeatedLogin.details.callbackUrl, login.details.callbackUrl);
    assert.equal(fixture.calls.registration.length, 1);

    await auth.validateCredential(login.oauth.accessToken);

    config.saveOAuthConfig({
      ...login.oauth,
      accessToken: "oauth_access_stale",
      expiresAt: Date.now() + 5 * 60_000,
    });
    const retried = await auth.fetchWithAuth(`${fixture.baseUrl}/usage`);
    assert.equal(retried.status, 200);
    assert.equal((await retried.json()).credential, "oauth_access_refreshed");
    assert.deepEqual(fixture.calls.usageTokens.slice(-2), [
      "oauth_access_stale",
      "oauth_access_refreshed",
    ]);
    assert.equal(fixture.calls.refresh.length, 1);

    const saved = config.loadConfig();
    assert.equal(saved.oauth.accessToken, "oauth_access_refreshed");
    assert.equal(saved.oauth.refreshToken, "oauth_refresh_123");
    assert.equal(statSync(config.getConfigFilePath()).mode & 0o777, 0o600);
    assert.doesNotMatch(
      readFileSync(config.getConfigFilePath(), "utf8"),
      /legacy_api_key/
    );

    process.env.SEARCH1API_KEY = "legacy_api_key";
    const legacy = await auth.fetchWithAuth(`${fixture.baseUrl}/usage`);
    assert.equal(legacy.status, 200);
    assert.equal((await legacy.json()).credential, "legacy_api_key");
    delete process.env.SEARCH1API_KEY;

    let invalidStateRequest;
    await assert.rejects(
      auth.loginWithBrowser({
        openBrowser: false,
        timeoutMs: 5_000,
        onReady: ({ callbackUrl }) => {
          invalidStateRequest = fetch(
            `${callbackUrl}?code=authorization_code_123&state=wrong-state`
          );
        },
      }),
      /Authorization state mismatch/
    );
    assert.equal((await invalidStateRequest).status, 400);
  } finally {
    delete process.env.SEARCH1API_API_BASE;
    delete process.env.SEARCH1API_OAUTH_RESOURCE_METADATA;
    delete process.env.SEARCH1API_CONFIG_DIR;
    delete process.env.SEARCH1API_KEY;
    await fixture.close();
    rmSync(configDir, { force: true, recursive: true });
  }
});
