import { Command } from "commander";
import { trending, type TrendingService } from "../sdk.js";
import { printTrendingResults, printJson } from "../output.js";

const TRENDING_SERVICES = ["github", "hackernews"];

export function registerTrendingCommand(program: Command): void {
  program
    .command("trending <service>")
    .description(`Get trending topics (${TRENDING_SERVICES.join(", ")})`)
    .option("-n, --max-results <number>", "max results (1-50)", "10")
    .option("--json", "output raw JSON")
    .action(async (service: string, opts) => {
      const data = await trending(
        service as TrendingService,
        { maxResults: parseInt(opts.maxResults) }
      );

      if (opts.json) {
        printJson(data);
      } else {
        printTrendingResults(data.results);
      }
    });
}
