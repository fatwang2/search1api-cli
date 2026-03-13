import chalk from "chalk";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  content?: string;
}

interface TrendingResult {
  title: string;
  url: string;
  description?: string;
}

export function printSearchResults(results: SearchResult[], showContent = false): void {
  if (!results.length) {
    console.log(chalk.yellow("No results found."));
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(chalk.bold.blue(`${i + 1}. ${r.title}`));
    console.log(chalk.dim(r.link));
    console.log(r.snippet);
    if (showContent && r.content) {
      console.log(chalk.cyan("\n--- Content ---"));
      console.log(r.content);
    }
    console.log();
  }
}

export function printTrendingResults(results: TrendingResult[]): void {
  if (!results.length) {
    console.log(chalk.yellow("No trending results."));
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(chalk.bold.blue(`${i + 1}. ${r.title}`));
    console.log(chalk.dim(r.url));
    if (r.description) console.log(r.description);
    console.log();
  }
}

export function printCrawlResult(result: { title: string; link: string; content: string }): void {
  console.log(chalk.bold.blue(result.title));
  console.log(chalk.dim(result.link));
  console.log();
  console.log(result.content);
}

export function printSitemapLinks(links: string[]): void {
  if (!links.length) {
    console.log(chalk.yellow("No links found."));
    return;
  }
  for (const link of links) {
    console.log(link);
  }
  console.log(chalk.dim(`\nTotal: ${links.length} links`));
}

export function printReasoning(content: string): void {
  console.log(content);
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
