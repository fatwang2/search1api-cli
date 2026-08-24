import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type LearnMode = "page" | "site";
export type InstallScope = "global" | "project";

export interface LearnedPage {
  url: string;
  title: string;
  content: string;
}

export interface SourceEntry {
  file: string;
  url: string;
  title: string;
  hash: string;
}

export interface Sources {
  version: 1;
  name: string;
  source: string;
  mode: LearnMode;
  learnedAt: string;
  pages: SourceEntry[];
}

export interface WriteResult {
  dir: string;
  entries: SourceEntry[];
  keptSkillFile: boolean;
  refreshedTable: boolean;
  removed: string[];
}

const MAX_NAME_LENGTH = 48;
const MAX_FILENAME_LENGTH = 80;
const SOURCES_FILE = "references/sources.json";
const TABLE_START = "<!-- s1:references:start -->";
const TABLE_END = "<!-- s1:references:end -->";

export function sanitizeSegment(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truncateName(value: string): string {
  if (value.length <= MAX_NAME_LENGTH) return value;
  return value.slice(0, MAX_NAME_LENGTH).replace(/-+[^-]*$/, "") || value.slice(0, MAX_NAME_LENGTH);
}

/**
 * `docs.umami.is` -> `umami`. The TLD carries no meaning in a skill name, and
 * neither does the subdomain a project parks its docs on.
 */
const DOC_SUBDOMAINS = new Set([
  "docs",
  "doc",
  "developer",
  "developers",
  "dev",
  "help",
  "support",
  "learn",
  "wiki",
  "www",
]);

export function hostSlug(hostname: string): string {
  const labels = hostname.split(".").filter(Boolean);
  const kept = labels.length > 1 ? labels.slice(0, -1) : labels.slice();
  while (kept.length > 1 && DOC_SUBDOMAINS.has(kept[0])) {
    kept.shift();
  }
  return sanitizeSegment(kept.join("-")) || "site";
}

export function skillName(url: string, mode: LearnMode): string {
  const parsed = new URL(url);
  const host = hostSlug(parsed.hostname);
  if (mode === "site") return truncateName(host);

  const segments = parsed.pathname.split("/").map(sanitizeSegment).filter(Boolean);
  const last = segments.at(-1);
  if (!last || host.split("-").includes(last)) return truncateName(host);
  return truncateName(`${host}-${last}`);
}

export function referenceFilename(url: string, taken: Set<string>): string {
  let base: string;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.(html?|md|php|aspx?)$/i, "");
    base = sanitizeSegment(path.replace(/\//g, "-"));
  } catch {
    base = sanitizeSegment(url);
  }
  if (!base) base = "index";
  if (base.length > MAX_FILENAME_LENGTH) {
    base = base.slice(0, MAX_FILENAME_LENGTH).replace(/-+$/, "");
  }

  // Two different URLs can flatten to the same name (`/a/b` and `/a-b`).
  // Suffix instead of silently overwriting the earlier page.
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  taken.add(candidate);
  return `${candidate}.md`;
}

function yamlString(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return `"${collapsed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function renderReference(page: LearnedPage): string {
  const title = page.title?.trim() || page.url;
  return `---\ntitle: ${yamlString(title)}\nurl: ${page.url}\n---\n\n${page.content.trim()}\n`;
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/**
 * Titles repeat across a doc site — three pages called "Overview" are useless
 * to route on — so every row carries its path too.
 */
export function renderReferenceTable(entries: SourceEntry[]): string {
  const rows = entries
    .map((entry) => {
      let path = entry.url;
      try {
        path = new URL(entry.url).pathname;
      } catch {
        // Keep the raw value when it is not a parseable URL.
      }
      return `| ${cell(entry.title)} | ${cell(path)} | [${entry.file}](${entry.file}) |`;
    })
    .join("\n");
  return `${TABLE_START}\n| Page | Path | File |\n| --- | --- | --- |\n${rows}\n${TABLE_END}`;
}

/** Replace the generated table in place, leaving every other line alone. */
export function spliceReferenceTable(existing: string, table: string): string | null {
  const start = existing.indexOf(TABLE_START);
  const end = existing.indexOf(TABLE_END);
  if (start === -1 || end === -1 || end < start) return null;
  return existing.slice(0, start) + table + existing.slice(end + TABLE_END.length);
}

function extractReferenceTable(text: string): string | null {
  const start = text.indexOf(TABLE_START);
  const end = text.indexOf(TABLE_END);
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + TABLE_END.length);
}

/**
 * Deterministic routing layer only — no model writes this file. The user's own
 * agent edits the trigger wording; a refresh must never clobber that.
 */
export function renderSkillFile(options: {
  name: string;
  source: string;
  mode: LearnMode;
  entries: SourceEntry[];
}): string {
  const { name, source, mode, entries } = options;
  const host = new URL(source).hostname.replace(/^www\./, "");
  const scope = mode === "site" ? `the ${host} site` : `${host}`;

  return `---
name: ${name}
description: >
  Reference material captured from ${scope}. Use this skill when the user asks
  about ${host}, or about anything documented on the pages listed below. Edit
  this description so it names the topics your agent should trigger on.
---

# ${name}

Reference material learned from [${source}](${source}) with \`s1 learn\`.

## When to use

Use this skill when a question is answered by the pages below. Look up the
topic in the table, then read that file under \`references/\`. Do not guess at
content that is not in these files — crawl the site again instead.

## References

${renderReferenceTable(entries)}

Refresh with \`s1 learn ${source}${mode === "site" ? " --site" : ""}\`. A refresh
rewrites \`references/\` and leaves this file exactly as you have edited it.
`;
}

export function buildEntries(pages: LearnedPage[]): Array<SourceEntry & { body: string }> {
  const taken = new Set<string>();
  return pages.map((page) => {
    const filename = referenceFilename(page.url, taken);
    const body = renderReference(page);
    return {
      file: `references/${filename}`,
      url: page.url,
      title: page.title?.trim() || page.url,
      hash: `sha256:${createHash("sha256").update(page.content).digest("hex")}`,
      body,
    };
  });
}

function readSources(dir: string): Sources | null {
  const path = join(dir, SOURCES_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Sources;
  } catch {
    return null;
  }
}

/**
 * True when SKILL.md is byte-identical to what the previous run generated —
 * i.e. nobody has edited it, so refreshing it loses nothing and keeps its
 * reference table honest.
 */
function skillFileIsUntouched(dir: string, previous: Sources | null): boolean {
  if (!previous) return false;
  const path = join(dir, "SKILL.md");
  if (!existsSync(path)) return false;
  return (
    readFileSync(path, "utf-8") ===
    renderSkillFile({
      name: previous.name,
      source: previous.source,
      mode: previous.mode,
      entries: previous.pages,
    })
  );
}

/** A directory `s1 learn` produced, and may therefore rewrite. */
export function isLearnedDirectory(dir: string): boolean {
  return readSources(dir) !== null;
}

export function writeSkillDirectory(options: {
  dir: string;
  name: string;
  source: string;
  mode: LearnMode;
  pages: LearnedPage[];
  now?: string;
}): WriteResult {
  const { dir, name, source, mode, pages } = options;
  const previous = readSources(dir);
  const entries = buildEntries(pages);

  mkdirSync(join(dir, "references"), { recursive: true });

  // Only drop reference files a previous run of ours wrote. Anything else in
  // the directory belongs to the user.
  const kept = new Set(entries.map((entry) => entry.file));
  const removed: string[] = [];
  for (const stale of previous?.pages ?? []) {
    if (kept.has(stale.file)) continue;
    const path = join(dir, stale.file);
    if (existsSync(path)) {
      rmSync(path);
      removed.push(stale.file);
    }
  }

  for (const entry of entries) {
    writeFileSync(join(dir, entry.file), entry.body);
  }

  const plain: SourceEntry[] = entries.map(({ body: _body, ...entry }) => entry);
  const sources: Sources = {
    version: 1,
    name,
    source,
    mode,
    learnedAt: options.now ?? new Date().toISOString(),
    pages: plain,
  };
  writeFileSync(join(dir, SOURCES_FILE), `${JSON.stringify(sources, null, 2)}\n`);

  const skillPath = join(dir, "SKILL.md");
  const keptSkillFile = existsSync(skillPath) && !skillFileIsUntouched(dir, previous);
  let refreshedTable = false;
  if (keptSkillFile) {
    // The prose is the user's; the table between the markers is ours.
    const existing = readFileSync(skillPath, "utf-8");
    const spliced = spliceReferenceTable(existing, renderReferenceTable(plain));
    if (spliced !== null && spliced !== existing) {
      writeFileSync(skillPath, spliced);
      refreshedTable = true;
    }
  } else {
    writeFileSync(skillPath, renderSkillFile({ name, source, mode, entries: plain }));
  }

  return { dir, entries: plain, keptSkillFile, refreshedTable, removed };
}

export function stagingDirectory(name: string): string {
  const cacheRoot =
    process.env.SEARCH1API_LEARN_DIR ??
    process.env.XDG_CACHE_HOME ??
    join(homedir(), ".cache");
  return join(cacheRoot, "search1api", "learn", name);
}

export function installDirectory(scope: InstallScope, name: string): string {
  const root = scope === "global" ? join(homedir(), ".agents", "skills") : join(process.cwd(), ".agents", "skills");
  return join(root, name);
}

/**
 * Copy a staged skill into place. An existing directory we did not write is
 * never touched; one we did write keeps its (possibly edited) SKILL.md.
 */
export function installStagedSkill(
  from: string,
  to: string
): { keptSkillFile: boolean; refreshedTable: boolean } {
  if (!existsSync(join(from, SOURCES_FILE))) {
    throw new Error(`${from} is not a skill directory produced by s1 learn.`);
  }
  if (!existsSync(to)) {
    mkdirSync(to, { recursive: true });
    cpSync(from, to, { recursive: true });
    return { keptSkillFile: false, refreshedTable: false };
  }
  const installed = readSources(to);
  if (!installed) {
    throw new Error(
      `${to} already exists and was not created by s1 learn. Refusing to overwrite it.`
    );
  }
  const untouched = skillFileIsUntouched(to, installed);
  rmSync(join(to, "references"), { recursive: true, force: true });
  cpSync(join(from, "references"), join(to, "references"), { recursive: true });
  if (untouched || !existsSync(join(to, "SKILL.md"))) {
    cpSync(join(from, "SKILL.md"), join(to, "SKILL.md"));
    return { keptSkillFile: false, refreshedTable: false };
  }

  const table = extractReferenceTable(readFileSync(join(from, "SKILL.md"), "utf-8"));
  const existing = readFileSync(join(to, "SKILL.md"), "utf-8");
  const spliced = table ? spliceReferenceTable(existing, table) : null;
  if (spliced !== null && spliced !== existing) {
    writeFileSync(join(to, "SKILL.md"), spliced);
    return { keptSkillFile: true, refreshedTable: true };
  }
  return { keptSkillFile: true, refreshedTable: false };
}

/** Same-origin, hash-free, trailing-slash-free, deduped, in input order. */
export function normalizeCandidates(links: Iterable<string>, base: string): string[] {
  const origin = new URL(base);
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const link of links) {
    let parsed: URL;
    try {
      parsed = new URL(link, origin);
    } catch {
      continue;
    }
    if (parsed.origin !== origin.origin) continue;
    parsed.hash = "";
    // `/docs` and `/docs/` are the same page and would otherwise be crawled
    // twice, costing a credit and writing a duplicate reference file.
    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    const normalized = parsed.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push(normalized);
  }
  return candidates;
}

/**
 * Order candidates for learning. Pages under the requested path win, then
 * shallower ones — a skill built from the first 20 pages of a doc site should be
 * its overview pages, not whichever links the sitemap happened to list first.
 */
export function rankUrls(urls: string[], source: string): string[] {
  const prefix = new URL(source).pathname.replace(/\/+$/, "");
  return urls
    .map((url, index) => {
      const path = new URL(url).pathname;
      return {
        url,
        index,
        underPrefix: prefix ? (path === prefix || path.startsWith(`${prefix}/`) ? 0 : 1) : 0,
        depth: path.split("/").filter(Boolean).length,
      };
    })
    .sort(
      (a, b) =>
        a.underPrefix - b.underPrefix ||
        a.depth - b.depth ||
        a.url.length - b.url.length ||
        a.index - b.index
    )
    .map((item) => item.url);
}

export function selectSiteUrls(
  links: string[],
  source: string,
  limit: number
): { selected: string[]; discovered: number } {
  const candidates = normalizeCandidates([source, ...links], source);
  return {
    selected: rankUrls(candidates, source).slice(0, Math.max(1, limit)),
    discovered: candidates.length,
  };
}

/**
 * A page whose own text links to children under its path — `/docs/api` linking
 * to `/docs/api/authentication`. Crawling strips the rendered nav, so the text
 * usually names only a couple of them; the page is worth one discovery call to
 * get the rest.
 */
export function isSectionIndex(pageUrl: string, links: string[]): boolean {
  let base: string;
  try {
    base = new URL(pageUrl).pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
  if (!base) return false;
  return links.some((link) => {
    try {
      return new URL(link).pathname.startsWith(`${base}/`);
    } catch {
      return false;
    }
  });
}

/**
 * Links in already-crawled markdown. Sitemaps routinely omit whole subtrees —
 * umami's lists 51 pages and none of its API reference — but the section index
 * we just paid to crawl links to them, so following those costs no discovery.
 */
export function extractLinks(markdown: string, pageUrl: string): string[] {
  const found: string[] = [];
  const inline = /\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  const autolink = /<((?:https?:)\/\/[^\s>]+)>/g;
  for (const pattern of [inline, autolink]) {
    let match = pattern.exec(markdown);
    while (match !== null) {
      const href = match[1];
      if (href && !href.startsWith("#") && !href.startsWith("mailto:")) {
        found.push(href);
      }
      match = pattern.exec(markdown);
    }
  }
  return normalizeCandidates(found, pageUrl);
}
