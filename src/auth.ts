import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { API_BASE, APP_BASE, CLI_LOGIN_PATH } from "./config.js";

const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
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
      <h1>Login complete</h1>
      <p>You can close this tab and return to your terminal.</p>
    </div>
  </body>
</html>`;

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
      <h1>Login failed</h1>
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

function buildAuthUrl(callbackUrl: string, state: string): string {
  const url = new URL(CLI_LOGIN_PATH, APP_BASE);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("source", "cli");
  return url.toString();
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

async function readParams(req: IncomingMessage, requestUrl: URL): Promise<URLSearchParams> {
  const params = new URLSearchParams(requestUrl.searchParams);

  if (req.method !== "POST") {
    return params;
  }

  const body = await readBody(req);
  if (!body) {
    return params;
  }

  const contentType = req.headers["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        params.set(key, value);
      }
    }
    return params;
  }

  const formParams = new URLSearchParams(body);
  for (const [key, value] of formParams.entries()) {
    params.set(key, value);
  }

  return params;
}

function getReturnedApiKey(params: URLSearchParams): string | null {
  return params.get("apiKey") ?? params.get("api_key") ?? params.get("key") ?? params.get("token");
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
  apiKey: string;
  details: BrowserLoginStart;
}

export async function loginWithBrowser(options: BrowserLoginOptions = {}): Promise<BrowserLoginResult> {
  const state = randomUUID();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<BrowserLoginResult>((resolve, reject) => {
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let details: BrowserLoginStart | undefined;

    const finish = (error?: Error, result?: BrowserLoginResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      server.close();

      if (error) {
        reject(error);
        return;
      }

      if (!result) {
        reject(new Error("Browser login finished without a result."));
        return;
      }

      resolve(result);
    };

    const server = createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

        if (requestUrl.pathname !== CALLBACK_PATH) {
          respond(res, 404, errorHtml("This callback URL is only used for Search1API CLI login."));
          return;
        }

        const params = await readParams(req, requestUrl);
        const returnedState = params.get("state");
        const errorMessage = params.get("error") ?? params.get("message");

        if (errorMessage) {
          respond(res, 400, errorHtml(errorMessage));
          finish(new Error(`Browser authorization failed: ${errorMessage}`));
          return;
        }

        if (returnedState !== state) {
          respond(res, 400, errorHtml("The authorization state did not match. Please try again."));
          finish(new Error("Authorization state mismatch. Please retry `s1 login`."));
          return;
        }

        const apiKey = getReturnedApiKey(params);
        if (!apiKey) {
          respond(res, 400, errorHtml("No API key was returned by the authorization flow."));
          finish(new Error("Authorization completed, but no API key was returned."));
          return;
        }

        if (!details) {
          respond(res, 500, errorHtml("The login flow was not initialized correctly."));
          finish(new Error("Login flow was not initialized correctly."));
          return;
        }

        respond(res, 200, SUCCESS_HTML);
        finish(undefined, {
          apiKey,
          details,
        });
      } catch (error) {
        respond(res, 500, errorHtml("Unexpected callback error. You can close this tab and try again."));
        finish(error instanceof Error ? error : new Error("Unexpected callback error."));
      }
    });

    server.on("error", (error) => {
      finish(error instanceof Error ? error : new Error("Failed to start callback server."));
    });

    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const callbackUrl = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
      const authUrl = buildAuthUrl(callbackUrl, state);
      const browserOpened = options.openBrowser === false ? false : openBrowser(authUrl);

      details = {
        authUrl,
        callbackUrl,
        browserOpened,
        port: address.port,
      };

      options.onReady?.(details);

      timeoutHandle = setTimeout(() => {
        finish(new Error(`Timed out waiting for browser authorization after ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
    });
  });
}

export async function validateApiKey(apiKey: string): Promise<void> {
  const res = await fetch(`${API_BASE}/usage`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Received API key, but validation failed (${res.status}): ${text}`);
  }
}
