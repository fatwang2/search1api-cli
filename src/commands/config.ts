import { Command } from "commander";
import {
  clearSavedCredentials,
  loadConfig,
  saveApiKey,
} from "../config.js";
import chalk from "chalk";

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Manage configuration and manual API keys");

  config
    .command("set-key <key>")
    .description("Set your Search1API key manually")
    .action((key: string) => {
      saveApiKey(key);
      console.log(chalk.green("API key saved."));
    });

  config
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const envKey = process.env.SEARCH1API_KEY;
      const cfg = loadConfig();

      if (envKey) {
        console.log(`API Key (env): ${envKey.slice(0, 8)}...${envKey.slice(-4)}`);
      } else if (cfg.oauth) {
        console.log("Authentication: OAuth 2.1");
        console.log(`Client ID: ${cfg.oauth.clientId}`);
        if (cfg.oauth.expiresAt) {
          console.log(`Access token expires: ${new Date(cfg.oauth.expiresAt).toISOString()}`);
        }
      } else if (cfg.apiKey) {
        console.log(`API Key (config): ${cfg.apiKey.slice(0, 8)}...${cfg.apiKey.slice(-4)}`);
      } else {
        console.log(chalk.yellow("No API key configured."));
      }
    });

  config
    .command("clear")
    .description("Remove saved OAuth tokens and API keys")
    .action(() => {
      clearSavedCredentials();
      console.log(chalk.green("Saved credentials removed."));
    });
}
