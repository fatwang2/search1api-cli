import { Command } from "commander";
import { request } from "../api.js";
import { printCrawlResult, printJson } from "../output.js";

interface CrawlResponse {
  results: {
    title: string;
    link: string;
    content: string;
  };
}

export function registerCrawlCommand(program: Command): void {
  program
    .command("crawl <url>")
    .description("Extract content from a URL")
    .option("--json", "output raw JSON")
    .action(async (url: string, opts) => {
      const data = await request<CrawlResponse>("/crawl", { url });

      if (opts.json) {
        printJson(data);
      } else {
        printCrawlResult(data.results);
      }
    });
}
