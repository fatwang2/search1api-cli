import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "search1api");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

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
      "  s1 config set-key <your-api-key>\n" +
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

export const API_BASE = "https://api.search1api.com";
