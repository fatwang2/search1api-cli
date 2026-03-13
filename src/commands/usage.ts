import { Command } from "commander";
import { getApiKey, API_BASE } from "../config.js";
import { printJson } from "../output.js";
import chalk from "chalk";

export function registerUsageCommand(program: Command): void {
  program
    .command("balance")
    .description("Check remaining API credits")
    .option("--json", "output raw JSON")
    .action(async (opts) => {
      const apiKey = getApiKey();

      const res = await fetch(`${API_BASE}/usage`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error (${res.status}): ${text}`);
      }

      const data = await res.json();

      if (opts.json) {
        printJson(data);
        return;
      }

      console.log(chalk.bold.blue("Account Balance"));

      const LABEL_MAP: Record<string, string> = {
        usage: "Remaining Credits",
      };

      for (const [key, value] of Object.entries(data)) {
        const label = LABEL_MAP[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        console.log(`${chalk.dim(label + ":")} ${value}`);
      }
    });
}
