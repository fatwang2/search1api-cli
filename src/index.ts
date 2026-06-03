#!/usr/bin/env node

import updateNotifier from "update-notifier";
import chalk from "chalk";
import { Command } from "commander";
import { registerSearchCommand } from "./commands/search.js";

declare const __PKG_VERSION__: string | undefined;
declare const __PKG_NAME__: string | undefined;

let pkg: { name: string; version: string };
const isBinary = typeof __PKG_VERSION__ !== "undefined";
if (isBinary) {
  pkg = { name: __PKG_NAME__!, version: __PKG_VERSION__! };
} else {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  pkg = require("../package.json");
}
const notifier = updateNotifier({ pkg });
if (isBinary && notifier.update) {
  notifier.notify({
    message:
      `Update available ${chalk.dim(notifier.update.current)} → ` +
      `${chalk.green(notifier.update.latest)}\n` +
      `Run ${chalk.cyan("s1 update")} to update`,
  });
} else {
  notifier.notify();
}
import { registerNewsCommand } from "./commands/news.js";
import { registerCrawlCommand } from "./commands/crawl.js";
import { registerSitemapCommand } from "./commands/sitemap.js";
import { registerReasoningCommand } from "./commands/reasoning.js";
import { registerTrendingCommand } from "./commands/trending.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerUsageCommand } from "./commands/usage.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerUpdateCommand } from "./commands/update.js";

const program = new Command();

program
  .name("search1api")
  .description("CLI for Search1API - search, news, crawl, sitemap, reasoning & trending")
  .version(pkg.version);

registerSearchCommand(program);
registerNewsCommand(program);
registerCrawlCommand(program);
registerSitemapCommand(program);
registerReasoningCommand(program);
registerTrendingCommand(program);
registerUsageCommand(program);
registerLoginCommand(program);
registerConfigCommand(program);
registerUpdateCommand(program, { pkg, isBinary });

if (process.argv.length <= 2) {
  console.log(`
  ${chalk.bold.blue("Search1API CLI")} ${chalk.dim(`v${pkg.version}`)}
  ${chalk.dim("The universal search tool for your terminal.")}

  ${chalk.bold("Quick start:")}
    ${chalk.blue("s1 search")} ${chalk.dim('"your query"')}        Search the web
    ${chalk.blue("s1 news")} ${chalk.dim('"your query"')}          Search for news
    ${chalk.blue("s1 crawl")} ${chalk.dim("<url>")}               Extract content from a URL
    ${chalk.blue("s1 trending")} ${chalk.dim("<service>")}         Trending on GitHub / HackerNews
    ${chalk.blue("s1 reasoning")} ${chalk.dim('"your question"')}  Deep thinking (DeepSeek R1)
    ${chalk.blue("s1 balance")}                    Check remaining credits

  ${chalk.bold("Setup:")}
    ${chalk.blue("s1 login")}                      Log in with your browser
    ${chalk.blue("s1 config set-key")} ${chalk.dim("<key>")}       Set your API key manually
    ${chalk.blue("s1 --help")}                     See all options

  ${chalk.dim("Get your API key at")} ${chalk.blue("https://search1api.com")}
`);
} else {
  program.parseAsync().catch((err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
