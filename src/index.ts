#!/usr/bin/env node

import { createRequire } from "node:module";
import updateNotifier from "update-notifier";
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

program.parseAsync().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
