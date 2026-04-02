import chalk from "chalk";
import { Command } from "commander";
import { loginWithBrowser, validateApiKey } from "../auth.js";
import { getConfigFilePath, saveApiKey } from "../config.js";

function parseInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Log in with your browser and save your API key")
    .option("--no-browser", "print the authorization URL instead of opening a browser")
    .option("--timeout <seconds>", "wait timeout in seconds", "300")
    .option("--port <number>", "callback port (default: random)")
    .action(async (opts) => {
      const timeoutSeconds = parseInteger(opts.timeout, "timeout");
      const port = opts.port ? parseInteger(opts.port, "port") : undefined;

      console.log(chalk.bold.blue("Search1API Login"));

      const result = await loginWithBrowser({
        openBrowser: opts.browser,
        port,
        timeoutMs: timeoutSeconds * 1000,
        onReady: ({ authUrl, callbackUrl, browserOpened }) => {
          console.log(`${chalk.dim("Callback:")} ${callbackUrl}`);
          if (browserOpened) {
            console.log(chalk.green("Opened your browser. Complete sign-in to continue."));
          } else {
            console.log(chalk.yellow("Open this URL to continue sign-in:"));
            console.log(authUrl);
          }
        },
      });

      console.log(chalk.dim("Validating API key..."));
      await validateApiKey(result.apiKey);
      saveApiKey(result.apiKey);

      console.log(chalk.green("Login complete. API key saved."));
      console.log(`${chalk.dim("Config file:")} ${getConfigFilePath()}`);

      if (process.env.SEARCH1API_KEY) {
        console.log(
          chalk.yellow(
            "Note: SEARCH1API_KEY is set in your environment and will override the saved key."
          )
        );
      }
    });
}
