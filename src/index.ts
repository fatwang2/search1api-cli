#!/usr/bin/env node

import { createRequire } from "node:module";
import updateNotifier from "update-notifier";
import chalk from "chalk";
import { Command } from "commander";
import { registerSearchCommand } from "./commands/search.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
updateNotifier({ pkg }).notify();
import { registerNewsCommand } from "./commands/news.js";
import { registerCrawlCommand } from "./commands/crawl.js";
import { registerSitemapCommand } from "./commands/sitemap.js";
import { registerReasoningCommand } from "./commands/reasoning.js";
import { registerTrendingCommand } from "./commands/trending.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerUsageCommand } from "./commands/usage.js";

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
registerConfigCommand(program);

// Show welcome page when no arguments
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
    ${chalk.blue("s1 config set-key")} ${chalk.dim("<key>")}       Set your API key
    ${chalk.blue("s1 --help")}                     See all options

  ${chalk.dim("Get your API key at")} ${chalk.blue("https://search1api.com")}
`);
} else {
  program.parseAsync().catch((err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
