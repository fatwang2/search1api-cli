import { Command } from "commander";
import { sitemap } from "../sdk.js";
import { printSitemapLinks, printJson } from "../output.js";

export function registerSitemapCommand(program: Command): void {
  program
    .command("sitemap <url>")
    .description("Get related links from a URL")
    .option("--json", "output raw JSON")
    .action(async (url: string, opts) => {
      const data = await sitemap(url);

      if (opts.json) {
        printJson(data);
      } else {
        printSitemapLinks(data.links);
      }
    });
}
