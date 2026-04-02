import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "search1api");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const API_BASE = process.env.SEARCH1API_API_BASE ?? "https://api.search1api.com";
export const APP_BASE = process.env.SEARCH1API_APP_BASE ?? "https://dashboard.search1api.com";
export const CLI_LOGIN_PATH = process.env.SEARCH1API_CLI_LOGIN_PATH ?? "/cli-auth";

interface Config {
  apiKey?: string;
}

export function getApiKey(): string {
  // 1. Environment variable takes priority
  if (process.env.SEARCH1API_KEY) {
    return process.env.SEARCH1API_KEY;
  }

  // 2. Config file
  const config = loadConfig();
  if (config.apiKey) {
    return config.apiKey;
  }

  console.error(
    "Error: API key not found. Set it via:\n" +
      "  s1 login\n" +
      "  or s1 config set-key <your-api-key>\n" +
      "  or export SEARCH1API_KEY=<your-api-key>"
  );
  process.exit(1);
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function saveApiKey(apiKey: string): void {
  const config = loadConfig();
  config.apiKey = apiKey;
  saveConfig(config);
}

export function getConfigFilePath(): string {
  return CONFIG_FILE;
}
