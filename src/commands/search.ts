import { Command } from "commander";
import { request } from "../api.js";
import { printSearchResults, printJson } from "../output.js";

const SEARCH_SERVICES = [
  "google", "bing", "duckduckgo", "yahoo", "x", "reddit",
  "github", "youtube", "arxiv", "wechat", "bilibili", "imdb", "wikipedia",
];

interface SearchResponse {
  results: Array<{
    title: string;
    link: string;
    snippet: string;
    content?: string;
  }>;
}

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
      const body: Record<string, unknown> = {
        query,
        max_results: parseInt(opts.maxResults),
        search_service: opts.service,
        crawl_results: parseInt(opts.crawl),
      };
      if (opts.include) body.include_sites = opts.include;
      if (opts.exclude) body.exclude_sites = opts.exclude;
      if (opts.time) body.time_range = opts.time;

      const data = await request<SearchResponse>("/search", body);

      if (opts.json) {
        printJson(data);
      } else {
        printSearchResults(data.results, parseInt(opts.crawl) > 0);
      }
    });
}
