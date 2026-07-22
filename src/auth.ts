import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  API_BASE,
  API_RESOURCE_METADATA,
  type OAuthConfig,
  type OAuthClientConfig,
  loadConfig,
  saveOAuthClientConfig,
  saveOAuthConfig,
} from "./config.js";

const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const OAUTH_SCOPES = "openid profile email offline_access";
const EXPIRY_SKEW_MS = 60_000;

const SUCCESS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Search1API Login Complete</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; color: #111827; }
      .card { max-width: 560px; margin: 10vh auto; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { margin: 0; line-height: 1.6; color: #4b5563; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorization complete</h1>
      <p>You can close this tab and return to your terminal.</p>
    </div>
  </body>
</html>`;

type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
};

type AuthorizationServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string | null;
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
};

type ClientRegistrationResponse = {
  client_id: string;
  token_endpoint_auth_method?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type PendingOAuth = {
  clientId: string;
  codeVerifier: string;
  metadata: AuthorizationServerMetadata;
};

function reusableCallbackPort(client?: OAuthClientConfig): number | undefined {
  if (!client) return undefined;
  try {
    const url = new URL(client.redirectUri);
    const port = Number.parseInt(url.port, 10);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.pathname !== CALLBACK_PATH ||
      !Number.isInteger(port) ||
      port <= 0
    ) {
      return undefined;
    }
    return port;
  } catch {
    return undefined;
  }
}

export type AccessCredential = {
  token: string;
  source: "environment_api_key" | "oauth" | "saved_api_key";
};

function errorHtml(message: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Search1API Login Failed</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; color: #111827; }
      .card { max-width: 560px; margin: 10vh auto; border: 1px solid #fecaca; background: #fef2f2; border-radius: 16px; padding: 32px; }
      h1 { margin: 0 0 12px; font-size: 28px; color: #991b1b; }
      p { margin: 0; line-height: 1.6; color: #7f1d1d; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorization failed</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function respond(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readParams(
  req: IncomingMessage,
  requestUrl: URL
): Promise<URLSearchParams> {
  const params = new URLSearchParams(requestUrl.searchParams);
  if (req.method !== "POST") return params;

  const body = await readBody(req);
  if (!body) return params;

  const contentType = req.headers["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") params.set(key, value);
    }
    return params;
  }

  for (const [key, value] of new URLSearchParams(body).entries()) {
    params.set(key, value);
  }
  return params;
}

function openBrowser(url: string): boolean {
  let command: string;
  let args: string[];

  switch (process.platform) {
    case "darwin":
      command = "open";
      args = [url];
      break;
    case "win32":
      command = "cmd";
      args = ["/c", "start", "", url];
      break;
    default:
      command = "xdg-open";
      args = [url];
      break;
  }

  const result = spawnSync(command, args, {
    stdio: "ignore",
    windowsHide: true,
  });
  return !result.error && (result.status === 0 || result.status === null);
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${label} failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as T;
}

export function authorizationServerMetadataUrl(issuer: string): string {
  const url = new URL(issuer);
  const issuerPath = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  url.pathname = `/.well-known/oauth-authorization-server${issuerPath}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function createPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

async function discoverAuthorizationServer(): Promise<AuthorizationServerMetadata> {
  const protectedResource = await readJson<ProtectedResourceMetadata>(
    await fetch(API_RESOURCE_METADATA),
    "Protected resource discovery"
  );
  const issuer = protectedResource.authorization_servers?.[0];
  if (!issuer) {
    throw new Error("Search1API did not advertise an OAuth authorization server.");
  }

  const metadata = await readJson<AuthorizationServerMetadata>(
    await fetch(authorizationServerMetadataUrl(issuer)),
    "Authorization server discovery"
  );
  if (!(metadata.authorization_endpoint && metadata.token_endpoint)) {
    throw new Error("Authorization server metadata is missing required endpoints.");
  }
  if (
    metadata.code_challenge_methods_supported &&
    !metadata.code_challenge_methods_supported.includes("S256")
  ) {
    throw new Error("The authorization server does not support PKCE S256.");
  }
  return metadata;
}

async function registerPublicClient(
  metadata: AuthorizationServerMetadata,
  callbackUrl: string
): Promise<string> {
  if (!metadata.registration_endpoint) {
    throw new Error(
      "Search1API OAuth client registration is not enabled yet. Use `s1 config set-key <key>` until the authorization server advertises a registration_endpoint."
    );
  }

  const registration = await readJson<ClientRegistrationResponse>(
    await fetch(metadata.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Search1API CLI",
        application_type: "native",
        redirect_uris: [callbackUrl],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: OAUTH_SCOPES,
      }),
    }),
    "OAuth client registration"
  );

  if (!registration.client_id) {
    throw new Error("OAuth client registration did not return a client_id.");
  }
  if (
    registration.token_endpoint_auth_method &&
    registration.token_endpoint_auth_method !== "none"
  ) {
    throw new Error("The authorization server did not register a public client.");
  }
  return registration.client_id;
}

function buildAuthorizationUrl(
  metadata: AuthorizationServerMetadata,
  callbackUrl: string,
  state: string,
  clientId: string,
  codeChallenge: string
): string {
  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function oauthConfigFromToken(
  token: TokenResponse,
  metadata: AuthorizationServerMetadata,
  clientId: string,
  priorRefreshToken?: string
): OAuthConfig {
  if (!token.access_token) {
    throw new Error("The token endpoint did not return an access token.");
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? priorRefreshToken,
    expiresAt:
      typeof token.expires_in === "number"
        ? Date.now() + token.expires_in * 1000
        : undefined,
    tokenType: token.token_type ?? "Bearer",
    scope: token.scope,
    clientId,
    tokenEndpoint: metadata.token_endpoint,
    issuer: metadata.issuer,
  };
}

async function exchangeAuthorizationCode(
  code: string,
  callbackUrl: string,
  pending: PendingOAuth
): Promise<OAuthConfig> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: pending.clientId,
    code_verifier: pending.codeVerifier,
  });
  const token = await readJson<TokenResponse>(
    await fetch(pending.metadata.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
    "Authorization code exchange"
  );
  return oauthConfigFromToken(token, pending.metadata, pending.clientId);
}

export interface BrowserLoginStart {
  authUrl: string;
  callbackUrl: string;
  browserOpened: boolean;
  port: number;
}

export interface BrowserLoginOptions {
  openBrowser?: boolean;
  port?: number;
  timeoutMs?: number;
  onReady?: (details: BrowserLoginStart) => void;
}

export interface BrowserLoginResult {
  oauth: OAuthConfig;
  details: BrowserLoginStart;
}

export async function loginWithBrowser(
  options: BrowserLoginOptions = {}
): Promise<BrowserLoginResult> {
  const state = randomUUID();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const storedClient = loadConfig().oauthClient;

  return new Promise<BrowserLoginResult>((resolve, reject) => {
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let details: BrowserLoginStart | undefined;
    let pendingOAuth: PendingOAuth | undefined;

    const finish = (error?: Error, result?: BrowserLoginResult) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      server.close();

      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      } else {
        reject(new Error("Browser login finished without a result."));
      }
    };

    const server = createServer(async (req, res) => {
      try {
        const requestUrl = new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "127.0.0.1"}`
        );
        if (requestUrl.pathname !== CALLBACK_PATH) {
          respond(
            res,
            404,
            errorHtml("This callback URL is only used for Search1API CLI login.")
          );
          return;
        }

        const params = await readParams(req, requestUrl);
        const returnedState = params.get("state");
        const oauthError = params.get("error");
        if (oauthError) {
          const description = params.get("error_description") ?? oauthError;
          respond(res, 400, errorHtml(description));
          finish(new Error(`Browser authorization failed: ${description}`));
          return;
        }
        if (returnedState !== state) {
          respond(
            res,
            400,
            errorHtml("The authorization state did not match. Please try again.")
          );
          finish(new Error("Authorization state mismatch. Please retry `s1 login`."));
          return;
        }

        const code = params.get("code");
        if (!(code && details && pendingOAuth)) {
          respond(
            res,
            400,
            errorHtml("The OAuth authorization response was incomplete.")
          );
          finish(new Error("OAuth authorization completed without a code."));
          return;
        }

        const oauth = await exchangeAuthorizationCode(
          code,
          details.callbackUrl,
          pendingOAuth
        );
        respond(res, 200, SUCCESS_HTML);
        finish(undefined, { oauth, details });
      } catch (error) {
        respond(
          res,
          500,
          errorHtml("Unexpected callback error. You can close this tab and try again.")
        );
        finish(
          error instanceof Error ? error : new Error("Unexpected callback error.")
        );
      }
    });

    server.on("error", (error) => {
      finish(
        error instanceof Error
          ? error
          : new Error("Failed to start callback server.")
      );
    });

    server.listen(
      options.port ?? reusableCallbackPort(storedClient) ?? 0,
      "127.0.0.1",
      () => {
      const address = server.address() as AddressInfo;
      const callbackUrl = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;

      void (async () => {
        const metadata = await discoverAuthorizationServer();
        const canReuseClient =
          storedClient?.issuer === metadata.issuer &&
          storedClient.redirectUri === callbackUrl;
        const clientId = canReuseClient
          ? storedClient.clientId
          : await registerPublicClient(metadata, callbackUrl);
        if (!canReuseClient) {
          saveOAuthClientConfig({
            clientId,
            issuer: metadata.issuer,
            redirectUri: callbackUrl,
          });
        }
        const pkce = createPkcePair();
        pendingOAuth = {
          clientId,
          codeVerifier: pkce.codeVerifier,
          metadata,
        };
        const authUrl = buildAuthorizationUrl(
          metadata,
          callbackUrl,
          state,
          clientId,
          pkce.codeChallenge
        );
        const browserOpened =
          options.openBrowser === false ? false : openBrowser(authUrl);
        details = {
          authUrl,
          callbackUrl,
          browserOpened,
          port: address.port,
        };
        options.onReady?.(details);
        timeoutHandle = setTimeout(() => {
          finish(
            new Error(
              `Timed out waiting for browser authorization after ${Math.round(timeoutMs / 1000)} seconds.`
            )
          );
        }, timeoutMs);
      })().catch((error: unknown) => {
        finish(
          error instanceof Error
            ? error
            : new Error("Failed to start OAuth authorization.")
        );
      });
      }
    );
  });
}

export async function refreshOAuthConfig(oauth: OAuthConfig): Promise<OAuthConfig> {
  if (!oauth.refreshToken) {
    throw new Error("OAuth access expired and no refresh token is available. Run `s1 login` again.");
  }

  const token = await readJson<TokenResponse>(
    await fetch(oauth.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: oauth.refreshToken,
        client_id: oauth.clientId,
      }),
    }),
    "OAuth token refresh"
  );
  const refreshed = oauthConfigFromToken(
    token,
    {
      issuer: oauth.issuer,
      authorization_endpoint: "",
      token_endpoint: oauth.tokenEndpoint,
    },
    oauth.clientId,
    oauth.refreshToken
  );
  saveOAuthConfig(refreshed);
  return refreshed;
}

export async function getAccessCredential(
  forceOAuthRefresh = false
): Promise<AccessCredential> {
  if (process.env.SEARCH1API_KEY) {
    return {
      token: process.env.SEARCH1API_KEY,
      source: "environment_api_key",
    };
  }

  const config = loadConfig();
  if (config.oauth) {
    const stillValid =
      config.oauth.expiresAt === undefined ||
      config.oauth.expiresAt - EXPIRY_SKEW_MS > Date.now();
    if (stillValid && !forceOAuthRefresh) {
      return { token: config.oauth.accessToken, source: "oauth" };
    }
    const refreshed = await refreshOAuthConfig(config.oauth);
    return { token: refreshed.accessToken, source: "oauth" };
  }

  if (config.apiKey) {
    return { token: config.apiKey, source: "saved_api_key" };
  }

  throw new Error(
    "No Search1API credential found. Run `s1 login`, `s1 config set-key <key>`, or set SEARCH1API_KEY."
  );
}

export async function fetchWithAuth(
  input: string | URL | Request,
  init: RequestInit = {}
): Promise<Response> {
  let credential = await getAccessCredential();
  const requestWith = (token: string) =>
    fetch(input, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        Authorization: `Bearer ${token}`,
      },
    });

  let response = await requestWith(credential.token);
  if (response.status === 401 && credential.source === "oauth") {
    credential = await getAccessCredential(true);
    response = await requestWith(credential.token);
  }
  return response;
}

export async function validateCredential(credential: string): Promise<void> {
  const response = await fetch(`${API_BASE}/usage`, {
    headers: { Authorization: `Bearer ${credential}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Received OAuth access token, but validation failed (${response.status}): ${text}`
    );
  }
}
