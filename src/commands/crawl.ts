import { Command } from "commander";
import { crawl } from "../sdk.js";
import { printCrawlResult, printJson } from "../output.js";

export function registerCrawlCommand(program: Command): void {
  program
    .command("crawl <url>")
    .description("Extract content from a URL")
    .option("--json", "output raw JSON")
    .action(async (url: string, opts) => {
      const data = await crawl(url);

      if (opts.json) {
        printJson(data);
      } else {
        printCrawlResult(data.results);
      }
    });
}
