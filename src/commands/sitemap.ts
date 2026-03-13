import { Command } from "commander";
import { request } from "../api.js";
import { printSitemapLinks, printJson } from "../output.js";

interface SitemapResponse {
  links: string[];
}

export function registerSitemapCommand(program: Command): void {
  program
    .command("sitemap <url>")
    .description("Get related links from a URL")
    .option("--json", "output raw JSON")
    .action(async (url: string, opts) => {
      const data = await request<SitemapResponse>("/sitemap", { url });

      if (opts.json) {
        printJson(data);
      } else {
        printSitemapLinks(data.links);
      }
    });
}
