import { Command } from "commander";
import { search, type SearchOptions } from "../sdk.js";
import { printSearchResults, printJson } from "../output.js";

const SEARCH_SERVICES = [
  "google", "bing", "duckduckgo", "yahoo", "x", "reddit",
  "github", "youtube", "arxiv", "wechat", "bilibili", "imdb", "wikipedia",
];

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Search the web")
    .option("-n, --max-results <number>", "max results (1-50)", "10")
    .option("-s, --service <service>", `search service (${SEARCH_SERVICES.join(", ")})`, "google")
    .option("-c, --crawl <number>", "crawl N results for full content", "0")
    .option("--include <sites...>", "only include these sites")
    .option("--exclude <sites...>", "exclude these sites")
    .option("-t, --time <range>", "time range: day, month, year")
    .option("--json", "output raw JSON")
    .action(async (query: string, opts) => {
      const options: SearchOptions = {
        maxResults: parseInt(opts.maxResults),
        searchService: opts.service,
        crawlResults: parseInt(opts.crawl),
      };
      if (opts.include) options.includeSites = opts.include;
      if (opts.exclude) options.excludeSites = opts.exclude;
      if (opts.time) options.timeRange = opts.time;

      const data = await search(query, options);

      if (opts.json) {
        printJson(data);
      } else {
        printSearchResults(data.results, parseInt(opts.crawl) > 0);
      }
    });
}
