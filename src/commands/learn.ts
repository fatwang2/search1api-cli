import chalk from "chalk";
import { Command } from "commander";
import { relative } from "node:path";
import {
  crawl,
  crawlBatch,
  sitemap,
  type CrawlResponse,
} from "../sdk.js";
import {
  extractLinks,
  installDirectory,
  isSectionIndex,
  installStagedSkill,
  isLearnedDirectory,
  normalizeCandidates,
  rankUrls,
  stagingDirectory,
  writeSkillDirectory,
  selectSiteUrls,
  skillName,
  type InstallScope,
  type LearnedPage,
  type LearnMode,
} from "../learn.js";
import { printJson } from "../output.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MAX_PAGES = 20;
const CRAWL_BATCH_SIZE = 5;
const MAX_INDEX_EXPANSIONS = 10;
const INSTALL_SCOPES: InstallScope[] = ["global", "project"];

function pageFromResponse(item: CrawlResponse, requestedUrl: string): LearnedPage | null {
  const content = item.results?.content?.trim();
  if (!content) return null;
  return {
    url: item.crawlParameters?.url ?? item.results?.link ?? requestedUrl,
    title: item.results?.title?.trim() || requestedUrl,
    content,
  };
}

async function crawlPages(
  urls: string[],
  log: (message: string) => void,
  done: number,
  total: number
): Promise<{ pages: LearnedPage[]; failed: string[] }> {
  const pages: LearnedPage[] = [];
  const failed: string[] = [];

  for (let i = 0; i < urls.length; i += CRAWL_BATCH_SIZE) {
    const batch = urls.slice(i, i + CRAWL_BATCH_SIZE);
    const results = await crawlBatch(batch);
    const byUrl = new Map<string, CrawlResponse>();
    for (const item of results) {
      const key = item.crawlParameters?.url ?? item.results?.link;
      if (key) byUrl.set(key, item);
    }
    for (const requested of batch) {
      const item = byUrl.get(requested);
      const page = item ? pageFromResponse(item, requested) : null;
      if (page) pages.push(page);
      else failed.push(requested);
    }
    log(chalk.dim(`Crawled ${done + Math.min(i + batch.length, urls.length)}/${total} pages`));
  }

  return { pages, failed };
}

async function learnSite(
  url: string,
  maxPages: number,
  depth: number,
  log: (message: string) => void
): Promise<{
  pages: LearnedPage[];
  failed: string[];
  discovered: number;
  credits: number;
  unfollowed: number;
}> {
  let credits = 1;
  const links = (await sitemap(url, { type: "sitemap" })).links ?? [];
  let { selected, discovered } = selectSiteUrls(links, url, maxPages);

  // A sitemap that yields nothing beyond the page we were given is no sitemap
  // at all; fall back to the links on the page itself.
  if (discovered <= 1) {
    log(chalk.dim("No sitemap links found, following on-page links instead (+1 credit)."));
    credits += 1;
    const fallback = (await sitemap(url, { type: "all" })).links ?? [];
    ({ selected, discovered } = selectSiteUrls(fallback, url, maxPages));
  }

  if (discovered > selected.length) {
    log(
      chalk.dim(
        `Discovered ${discovered} pages, learning the first ${selected.length}. ` +
          `Use --max-pages for more, or POST /deepcrawl for a whole-site archive.`
      )
    );
  }

  const pages: LearnedPage[] = [];
  const failed: string[] = [];
  const seen = new Set(selected);
  let frontier = selected;
  let unfollowed = 0;

  for (let level = 1; level <= depth && frontier.length; level += 1) {
    if (level > 1) {
      log(chalk.dim(`Following ${frontier.length} page(s) linked from level ${level - 1}`));
    }
    credits += frontier.length;
    const crawled = await crawlPages(frontier, log, pages.length, pages.length + frontier.length);
    pages.push(...crawled.pages);
    failed.push(...crawled.failed);

    // Free: the markdown was already paid for on the level we just crawled.
    const contentLinks = crawled.pages.map((page) => ({
      page,
      links: extractLinks(page.content, page.url),
    }));
    const discoveredLinks = contentLinks.flatMap((entry) => entry.links);

    if (level === depth) {
      unfollowed += normalizeCandidates(discoveredLinks, url).filter(
        (candidate) => !seen.has(candidate)
      ).length;
      break;
    }

    // Crawling strips the rendered nav, so a section index names only a couple
    // of its children in prose. One discovery call per index gets the rest.
    const indexes = contentLinks
      .filter((entry) => isSectionIndex(entry.page.url, entry.links))
      .slice(0, MAX_INDEX_EXPANSIONS);
    if (indexes.length) {
      log(
        chalk.dim(
          `Expanding ${indexes.length} section index page(s) (+${indexes.length} credits)`
        )
      );
      credits += indexes.length;
      const navLinks = await Promise.all(
        indexes.map((entry) =>
          sitemap(entry.page.url, { type: "all" })
            .then((result) => result.links ?? [])
            .catch(() => [])
        )
      );
      discoveredLinks.push(...navLinks.flat());
    }

    const linked = normalizeCandidates(discoveredLinks, url).filter(
      (candidate) => !seen.has(candidate)
    );
    const room = maxPages - seen.size;
    frontier = room > 0 ? rankUrls(linked, url).slice(0, room) : [];
    for (const candidate of frontier) seen.add(candidate);
    // Pages the cap left behind still count as not learned.
    unfollowed += linked.length - frontier.length;
  }

  return { pages, failed, discovered: seen.size, credits, unfollowed };
}

export function registerLearnCommand(program: Command): void {
  program
    .command("learn [url]")
    .description("Turn a URL into an installable Agent Skill directory")
    .option("--site", "learn the whole site instead of the single page")
    .option("--max-pages <number>", `max pages in --site mode`, String(DEFAULT_MAX_PAGES))
    .option("--depth <number>", "in --site mode, also follow links found in the pages learned", "1")
    .option("--name <name>", "skill directory name")
    .option("--out <dir>", "where to write the skill directory")
    .option("--from <dir>", "install an already-learned directory instead of crawling")
    .option("--install <scope>", `install into ${INSTALL_SCOPES.join(" or ")} skills`)
    .option("--json", "output raw JSON")
    .action(async (url: string | undefined, opts) => {
      const scope: InstallScope | undefined = opts.install;
      if (scope && !INSTALL_SCOPES.includes(scope)) {
        throw new Error(`--install must be one of: ${INSTALL_SCOPES.join(", ")}`);
      }
      if (!url && !opts.from) {
        throw new Error("Provide a URL to learn, or --from <dir> to install a learned directory.");
      }
      if (url && opts.from) {
        throw new Error("Use either a URL or --from <dir>, not both.");
      }

      const log = (message: string) => {
        if (!opts.json) console.log(message);
      };

      // --from installs what a previous run already paid for; it never crawls.
      if (opts.from) {
        const source = opts.from as string;
        if (!isLearnedDirectory(source)) {
          throw new Error(`${source} is not a skill directory produced by s1 learn.`);
        }
        const sources = JSON.parse(readFileSync(join(source, "references/sources.json"), "utf-8"));
        const name = (opts.name as string) ?? sources.name;
        if (!scope) {
          throw new Error("--from also needs --install <global|project>.");
        }
        const target = installDirectory(scope, name);
        const { keptSkillFile, refreshedTable } = installStagedSkill(source, target);
        if (opts.json) {
          printJson({ name, dir: target, installed: scope, keptSkillFile, refreshedTable, credits: 0 });
        } else {
          console.log(`${chalk.bold.blue(name)} installed to ${target}`);
          if (keptSkillFile) {
            const table = refreshedTable ? " Its reference table was refreshed." : "";
            console.log(chalk.dim(`Kept the SKILL.md that was already there.${table}`));
          }
        }
        return;
      }

      const target = url as string;
      const mode: LearnMode = opts.site ? "site" : "page";
      const name = (opts.name as string) ?? skillName(target, mode);
      const dir = (opts.out as string) ?? stagingDirectory(name);

      let pages: LearnedPage[];
      let failed: string[] = [];
      let credits: number;
      let unfollowed = 0;
      if (mode === "site") {
        const maxPages = Number.parseInt(opts.maxPages, 10);
        if (!Number.isInteger(maxPages) || maxPages < 1) {
          throw new Error("--max-pages must be a positive integer.");
        }
        const depth = Number.parseInt(opts.depth, 10);
        if (!Number.isInteger(depth) || depth < 1) {
          throw new Error("--depth must be a positive integer.");
        }
        const result = await learnSite(target, maxPages, depth, log);
        pages = result.pages;
        failed = result.failed;
        credits = result.credits;
        unfollowed = result.unfollowed;
      } else {
        credits = 1;
        const page = pageFromResponse(await crawl(target), target);
        if (!page) throw new Error(`Crawling ${target} returned no content.`);
        pages = [page];
      }

      if (!pages.length) {
        throw new Error(`Nothing could be crawled from ${target}.`);
      }

      const written = writeSkillDirectory({ dir, name, source: target, mode, pages });

      let installedTo: string | null = null;
      let installKeptSkill = false;
      let installRefreshedTable = false;
      if (scope) {
        const destination = installDirectory(scope, name);
        const installed = installStagedSkill(dir, destination);
        installKeptSkill = installed.keptSkillFile;
        installRefreshedTable = installed.refreshedTable;
        installedTo = destination;
      }

      if (opts.json) {
        printJson({
          name,
          mode,
          source: target,
          dir: installedTo ?? dir,
          staged: dir,
          installed: scope ?? null,
          credits,
          keptSkillFile: written.keptSkillFile || installKeptSkill,
          refreshedTable: written.refreshedTable || installRefreshedTable,
          pages: written.entries.map(({ file, url: pageUrl, title }) => ({
            file,
            url: pageUrl,
            title,
          })),
          failed,
          unfollowed,
        });
        return;
      }

      const pageWord = pages.length === 1 ? "page" : "pages";
      const creditWord = credits === 1 ? "credit" : "credits";
      console.log(
        `${chalk.bold.blue(name)} — ${pages.length} ${pageWord}, ~${credits} ${creditWord}`
      );
      console.log(chalk.dim(installedTo ?? dir));
      if (written.keptSkillFile || installKeptSkill) {
        const table = written.refreshedTable || installRefreshedTable ? " Its reference table was refreshed." : "";
        console.log(chalk.dim(`Kept your existing SKILL.md.${table}`));
      }
      if (written.removed.length) {
        console.log(chalk.dim(`Removed ${written.removed.length} reference(s) no longer on the site.`));
      }
      if (failed.length) {
        console.log(chalk.yellow(`${failed.length} page(s) could not be crawled and were skipped.`));
      }
      if (unfollowed) {
        console.log(
          chalk.dim(
            `${unfollowed} more page(s) are linked from what was learned but not ` +
              `included. Raise --max-pages, or --depth, to reach them.`
          )
        );
      }

      if (installedTo) {
        console.log(chalk.green(`Installed to ${installedTo}`));
        return;
      }
      console.log();
      console.log("Not installed yet. Once the user confirms, run one of:");
      console.log(`  ${chalk.blue(`s1 learn --from ${dir} --install project`)}  ${chalk.dim(relative(process.cwd(), installDirectory("project", name)))}`);
      console.log(`  ${chalk.blue(`s1 learn --from ${dir} --install global`)}   ${chalk.dim(installDirectory("global", name))}`);
    });
}
