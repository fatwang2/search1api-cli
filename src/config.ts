import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR =
  process.env.SEARCH1API_CONFIG_DIR ??
  join(homedir(), ".config", "search1api");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export const API_BASE =
  process.env.SEARCH1API_API_BASE ?? "https://api.search1api.com";
export const API_RESOURCE_METADATA =
  process.env.SEARCH1API_OAUTH_RESOURCE_METADATA ??
  `${API_BASE}/.well-known/oauth-protected-resource`;

export interface OAuthConfig {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
  clientId: string;
  tokenEndpoint: string;
  issuer: string;
}

export interface OAuthClientConfig {
  clientId: string;
  issuer: string;
  redirectUri: string;
}

export interface Config {
  apiKey?: string;
  oauth?: OAuthConfig;
  oauthClient?: OAuthClientConfig;
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  // Existing config files may predate the restrictive creation mode.
  chmodSync(CONFIG_FILE, 0o600);
}

export function saveApiKey(apiKey: string): void {
  const config = loadConfig();
  config.apiKey = apiKey;
  delete config.oauth;
  saveConfig(config);
}

export function saveOAuthConfig(oauth: OAuthConfig): void {
  const config = loadConfig();
  config.oauth = oauth;
  delete config.apiKey;
  saveConfig(config);
}

export function saveOAuthClientConfig(oauthClient: OAuthClientConfig): void {
  const config = loadConfig();
  config.oauthClient = oauthClient;
  saveConfig(config);
}

export function clearSavedCredentials(): void {
  const config = loadConfig();
  delete config.apiKey;
  delete config.oauth;
  saveConfig(config);
}

export function getConfigFilePath(): string {
  return CONFIG_FILE;
}
