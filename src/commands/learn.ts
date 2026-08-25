import chalk from "chalk";
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crawl, crawlBatch, sitemap, type CrawlResponse } from "../sdk.js";
import {
  applySkillName,
  bindInstalledSkill,
  hasPlaceholderDescription,
  installDirectory,
  installStagedSkill,
  isLearnedDirectory,
  selectSiteUrls,
  stagingDirectory,
  readSkillSources,
  summarizeSections,
  validateSkillDirectory,
  validateSkillName,
  writeSkillDirectory,
  type InstallScope,
  type LearnedPage,
  type Binding,
  type LearnMode,
  type RefreshDiff,
} from "../learn.js";
import { printJson } from "../output.js";

/** A safety valve for absurd sites, not a knob you are expected to set. */
const MAX_PAGES_CEILING = 500;
const CRAWL_BATCH_SIZE = 5;
const INSTALL_SCOPES: InstallScope[] = ["global", "project"];

const NAME_HELP =
  "Name the reusable job, not the source document — `umami-analytics`, not `docs-umami-is`. " +
  "Lowercase kebab-case, reusing the prefix of related skills you already have.";

function pageFromResponse(item: CrawlResponse, requestedUrl: string): LearnedPage | null {
  const content = item.results?.content?.trim();
  if (!content) return null;
  return {
    url: item.crawlParameters?.url ?? item.results?.link ?? requestedUrl,
    title: item.results?.title?.trim() || requestedUrl,
    content,
  };
}

async function crawlUrls(
  urls: string[],
  log: (message: string) => void
): Promise<{ pages: LearnedPage[]; failed: string[] }> {
  const pages: LearnedPage[] = [];
  const failed: string[] = [];

  for (let i = 0; i < urls.length; i += CRAWL_BATCH_SIZE) {
    const batch = urls.slice(i, i + CRAWL_BATCH_SIZE);
    let results: CrawlResponse[];
    try {
      results = await crawlBatch(batch);
    } catch (error) {
      log(chalk.yellow(`Batch failed (${(error as Error).message}); retrying those pages one by one.`));
      results = [];
    }

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
    log(chalk.dim(`Crawled ${Math.min(i + batch.length, urls.length)}/${urls.length}`));
  }

  // One retry each: a page that failed in a batch of five often succeeds alone.
  if (failed.length) {
    log(chalk.dim(`Retrying ${failed.length} page(s) that failed`));
    const stillFailed: string[] = [];
    for (const url of failed) {
      try {
        const page = pageFromResponse(await crawl(url), url);
        if (page) pages.push(page);
        else stillFailed.push(url);
      } catch {
        stillFailed.push(url);
      }
    }
    const recovered = failed.length - stillFailed.length;
    log(
      chalk.dim(
        `Retry recovered ${recovered} of ${failed.length}` +
          (stillFailed.length ? `; ${stillFailed.length} still failing` : "")
      )
    );
    return { pages, failed: stillFailed };
  }

  return { pages, failed };
}

async function discoverSite(
  url: string,
  exclude: string[],
  maxPages: number,
  log: (message: string) => void
) {
  const links = (await sitemap(url, { type: "sitemap" })).links ?? [];
  let selection = selectSiteUrls({ links, source: url, exclude, maxPages });

  // A site that publishes no sitemap falls back to the links on the page.
  if (selection.discovered <= 1) {
    log(chalk.dim("This site publishes no sitemap; following the links on the page instead."));
    const fallback = (await sitemap(url, { type: "all" })).links ?? [];
    selection = selectSiteUrls({ links: fallback, source: url, exclude, maxPages });
  }

  return { selection, sections: summarizeSections(selection.urls, url) };
}

/** Writing the store is not the same as an agent being able to find it. */
function reportBindings(bindings: Binding[]): void {
  const linked = bindings.filter((binding) => binding.linked);
  const blocked = bindings.filter((binding) => !binding.linked);

  if (linked.length) {
    console.log(chalk.dim(`Linked into ${linked.map((binding) => binding.path).join(", ")}`));
  }
  for (const binding of blocked) {
    console.log(chalk.yellow(`Not linked into ${binding.path}: ${binding.reason}`));
  }
  if (!bindings.length) {
    console.log(
      chalk.yellow(
        "No agent skill directory was found next to it, so no agent can see this yet."
      )
    );
  }
}

function reportNextSteps(dir: string): void {
  if (hasPlaceholderDescription(dir)) {
    console.log(
      chalk.yellow(
        "SKILL.md still has the generated description, so agents will not reliably pick this skill. Rewrite it to name the topics it answers."
      )
    );
  }
  console.log(chalk.dim(`Check it with: s1 learn --validate ${dir}`));
}

function reportDiff(diff: RefreshDiff | null): void {
  if (!diff) return;
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} new`);
  if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
  if (diff.removed.length) parts.push(`${diff.removed.length} gone`);
  parts.push(`${diff.unchanged} unchanged`);
  console.log(chalk.dim(`Since the last run: ${parts.join(", ")}`));
}

export function registerLearnCommand(program: Command): void {
  program
    .command("learn [url]")
    .description("Turn a URL into an installable Agent Skill directory")
    .option("--name <name>", "skill name — required; see the naming guidance on failure")
    .option("--site", "learn the whole site instead of the single page")
    .option("--discover", "with --site, only list what would be learned; crawls nothing")
    .option("--exclude <paths...>", "path prefixes to leave out, e.g. --exclude /docs/cloud")
    .option("--max-pages <number>", `safety valve for --site`, String(MAX_PAGES_CEILING))
    .option("--out <dir>", "where to write the skill directory")
    .option("--from <dir>", "install an already-learned directory instead of crawling")
    .option("--refresh <dir>", "relearn a directory using the source and scope it recorded")
    .option("--validate <dir>", "check a learned directory and report problems")
    .option("--install <scope>", `install into ${INSTALL_SCOPES.join(" or ")} skills`)
    .option("--json", "output raw JSON")
    .action(async (url: string | undefined, opts) => {
      if (opts.validate) {
        const report = validateSkillDirectory(opts.validate as string);
        if (opts.json) {
          printJson({ dir: opts.validate, ok: report.errors.length === 0, ...report });
        } else {
          for (const error of report.errors) console.log(chalk.red(`error  ${error}`));
          for (const warning of report.warnings) console.log(chalk.yellow(`warn   ${warning}`));
          if (!report.errors.length && !report.warnings.length) {
            console.log(chalk.green(`${report.pages} page(s), no problems found.`));
          }
          console.log(
            chalk.dim(
              "Static checks only — nothing here can tell whether a claim written into SKILL.md is true."
            )
          );
        }
        if (report.errors.length) process.exitCode = 1;
        return;
      }

      const scope: InstallScope | undefined = opts.install;
      if (scope && !INSTALL_SCOPES.includes(scope)) {
        throw new Error(`--install must be one of: ${INSTALL_SCOPES.join(", ")}`);
      }
      if (!url && !opts.from && !opts.refresh) {
        throw new Error(
          "Provide a URL to learn, --refresh <dir> to relearn one, or --from <dir> to install one."
        );
      }
      if ([url, opts.from, opts.refresh].filter(Boolean).length > 1) {
        throw new Error("Use only one of: a URL, --from <dir>, --refresh <dir>.");
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
        if (!scope) throw new Error("--from also needs --install <global|project>.");
        const sources = readSkillSources(source);
        if (opts.name) {
          const nameError = validateSkillName(opts.name as string);
          if (nameError) throw new Error(`${nameError}\n${NAME_HELP}`);
        }
        const name = (opts.name as string) ?? sources?.name;
        if (!name) throw new Error(`${source} records no name; pass --name.`);
        const renaming = name !== sources?.name;

        const target = installDirectory(scope, name);
        const { keptSkillFile, refreshedTable } = installStagedSkill(source, target);
        // The folder basename and the frontmatter name must agree.
        const { bodyMentionsOldName } = renaming
          ? applySkillName(target, name)
          : { bodyMentionsOldName: false };
        const bindings = bindInstalledSkill(scope, name, target);

        if (opts.json) {
          printJson({
            name,
            dir: target,
            installed: scope,
            keptSkillFile,
            refreshedTable,
            renamed: renaming,
            bindings,
            placeholderDescription: hasPlaceholderDescription(target),
          });
        } else {
          console.log(`${chalk.bold.blue(name)} installed to ${target}`);
          if (renaming) {
            console.log(chalk.dim(`Renamed from ${sources?.name}.`));
            if (bodyMentionsOldName) {
              console.log(chalk.yellow(`SKILL.md still mentions "${sources?.name}" in its body; update those by hand.`));
            }
          }
          if (keptSkillFile) {
            console.log(
              chalk.dim(
                `Kept the SKILL.md that was already there.${refreshedTable ? " Its reference table was refreshed." : ""}`
              )
            );
          }
          reportBindings(bindings);
          reportNextSteps(target);
        }
        return;
      }

      // --refresh replays what a directory recorded: same source, scope and name.
      const refreshing = opts.refresh ? readSkillSources(opts.refresh as string) : null;
      if (opts.refresh && !refreshing) {
        throw new Error(`${opts.refresh} is not a skill directory produced by s1 learn.`);
      }

      const target = (url as string) ?? refreshing!.source;
      const mode: LearnMode = refreshing ? refreshing.mode : opts.site ? "site" : "page";
      const exclude: string[] = opts.exclude ?? refreshing?.exclude ?? [];
      const maxPages = Number.parseInt(opts.maxPages, 10);
      if (!Number.isInteger(maxPages) || maxPages < 1) {
        throw new Error("--max-pages must be a positive integer.");
      }

      // Discovery is a single call and crawls nothing; look before naming.
      if (opts.discover) {
        if (!opts.site) throw new Error("--discover applies to --site.");
        const { selection, sections } = await discoverSite(target, exclude, maxPages, log);
        if (opts.json) {
          printJson({ source: target, ...selection, sections });
          return;
        }
        console.log(`${chalk.bold.blue(new URL(target).hostname)} — ${selection.urls.length} page(s) would be learned`);
        for (const section of sections) {
          console.log(`  ${chalk.dim(String(section.count).padStart(4))}  ${section.path}`);
        }
        if (selection.excluded) console.log(chalk.dim(`${selection.excluded} excluded by --exclude`));
        if (selection.overCap) {
          console.log(chalk.yellow(`${selection.overCap} more page(s) exceed --max-pages ${maxPages} and would be left out.`));
        }
        console.log(chalk.dim("\nChoose a name and rerun without --discover to learn these."));
        return;
      }

      // The CLI never invents a name. A name derived from the host describes the
      // source document; the skill should be named for the job it does.
      const name = (opts.name as string | undefined) ?? refreshing?.name;
      const nameError = validateSkillName(name ?? "");
      if (nameError) {
        throw new Error(`${nameError}\n${NAME_HELP}`);
      }
      const dir = (opts.refresh as string) ?? (opts.out as string) ?? stagingDirectory(name!);

      let pages: LearnedPage[];
      let failed: string[] = [];
      let overCap = 0;
      let excluded = 0;

      if (mode === "site") {
        const discovery = await discoverSite(target, exclude, maxPages, log);
        const { selection, sections } = discovery;
        overCap = selection.overCap;
        excluded = selection.excluded;
        log(
          chalk.dim(
            `${selection.discovered} page(s) published; learning ${selection.urls.length}` +
              (excluded ? `, ${excluded} excluded` : "") +
              ` across ${sections.length} section(s)`
          )
        );
        if (overCap) {
          log(chalk.yellow(`${overCap} page(s) exceed --max-pages ${maxPages} and were left out.`));
        }
        const crawled = await crawlUrls(selection.urls, log);
        pages = crawled.pages;
        failed = crawled.failed;
      } else {
        const page = pageFromResponse(await crawl(target), target);
        if (!page) throw new Error(`Crawling ${target} returned no content.`);
        pages = [page];
      }

      if (!pages.length) throw new Error(`Nothing could be crawled from ${target}.`);

      const written = writeSkillDirectory({
        dir,
        name: name!,
        source: target,
        mode,
        pages,
        failed,
        exclude,
      });

      if (refreshing && name !== refreshing.name) applySkillName(dir, name!);

      let installedTo: string | null = null;
      let installKeptSkill = false;
      let installRefreshedTable = false;
      let bindings: Binding[] = [];
      if (scope) {
        const destination = installDirectory(scope, name!);
        const installed = installStagedSkill(dir, destination);
        installKeptSkill = installed.keptSkillFile;
        installRefreshedTable = installed.refreshedTable;
        installedTo = destination;
        bindings = bindInstalledSkill(scope, name!, destination);
      }

      if (opts.json) {
        printJson({
          name,
          mode,
          source: target,
          dir: installedTo ?? dir,
          staged: dir,
          installed: scope ?? null,
          excluded,
          overCap,
          keptSkillFile: written.keptSkillFile || installKeptSkill,
          refreshedTable: written.refreshedTable || installRefreshedTable,
          diff: written.diff,
          bindings,
          placeholderDescription: hasPlaceholderDescription(installedTo ?? dir),
          pages: written.entries.map(({ file, url: pageUrl, title }) => ({ file, url: pageUrl, title })),
          failed,
        });
        return;
      }

      const pageWord = pages.length === 1 ? "page" : "pages";
      console.log(`${chalk.bold.blue(name!)} — ${pages.length} ${pageWord}`);
      console.log(chalk.dim(installedTo ?? dir));
      reportDiff(written.diff);
      if (written.keptSkillFile || installKeptSkill) {
        const table = written.refreshedTable || installRefreshedTable ? " Its reference table was refreshed." : "";
        console.log(chalk.dim(`Kept your existing SKILL.md.${table}`));
      }
      if (written.removed.length) {
        console.log(chalk.dim(`Removed ${written.removed.length} reference(s) no longer on the site.`));
      }
      if (failed.length) {
        console.log(chalk.yellow(`${failed.length} page(s) could not be crawled, after a retry each:`));
        for (const url of failed) console.log(chalk.yellow(`  ${url}`));
        console.log(chalk.dim("They are recorded in references/sources.json and retried on the next run."));
      }

      if (installedTo) {
        console.log(chalk.green(`Installed to ${installedTo}`));
        reportBindings(bindings);
        reportNextSteps(installedTo);
        return;
      }
      reportNextSteps(dir);
      console.log();
      console.log("Not installed yet. Once the user confirms, run one of:");
      console.log(`  ${chalk.blue(`s1 learn --from ${dir} --install project`)}`);
      console.log(`  ${chalk.blue(`s1 learn --from ${dir} --install global`)}`);
    });
}
