import { Command } from "commander";
import { news, type NewsOptions } from "../sdk.js";
import { printSearchResults, printJson } from "../output.js";

const NEWS_SERVICES = ["google", "bing", "duckduckgo", "yahoo", "hackernews"];

export function registerNewsCommand(program: Command): void {
  program
    .command("news <query>")
    .description("Search for news")
    .option("-n, --max-results <number>", "max results (1-50)", "10")
    .option("-s, --service <service>", `news service (${NEWS_SERVICES.join(", ")})`, "bing")
    .option("-c, --crawl <number>", "crawl N results for full content", "0")
    .option("--include <sites...>", "only include these sites")
    .option("--exclude <sites...>", "exclude these sites")
    .option("-t, --time <range>", "time range: day, month, year")
    .option("--json", "output raw JSON")
    .action(async (query: string, opts) => {
      const options: NewsOptions = {
        maxResults: parseInt(opts.maxResults),
        searchService: opts.service,
        crawlResults: parseInt(opts.crawl),
      };
      if (opts.include) options.includeSites = opts.include;
      if (opts.exclude) options.excludeSites = opts.exclude;
      if (opts.time) options.timeRange = opts.time;

      const data = await news(query, options);

      if (opts.json) {
        printJson(data);
      } else {
        printSearchResults(data.results, parseInt(opts.crawl) > 0);
      }
    });
}
