import { Command } from "commander";
import { loadConfig, saveConfig } from "../config.js";
import chalk from "chalk";

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Manage configuration");

  config
    .command("set-key <key>")
    .description("Set your Search1API key")
    .action((key: string) => {
      const cfg = loadConfig();
      cfg.apiKey = key;
      saveConfig(cfg);
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
      } else if (cfg.apiKey) {
        console.log(`API Key (config): ${cfg.apiKey.slice(0, 8)}...${cfg.apiKey.slice(-4)}`);
      } else {
        console.log(chalk.yellow("No API key configured."));
      }
    });
}
