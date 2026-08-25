import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
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
  /** Path prefixes left out, so a refresh keeps the same scope. */
  exclude?: string[];
  pages: SourceEntry[];
  /** URLs that were selected but could not be crawled, so a refresh can retry
   *  them and the gap is visible instead of silent. */
  failed?: string[];
}

export interface WriteResult {
  dir: string;
  entries: SourceEntry[];
  keptSkillFile: boolean;
  refreshedTable: boolean;
  removed: string[];
  diff: RefreshDiff | null;
}

const MAX_FILENAME_LENGTH = 80;
const MAX_NAME_LENGTH = 64;
const SOURCES_FILE = "references/sources.json";
const TABLE_START = "<!-- s1:references:start -->";
const TABLE_END = "<!-- s1:references:end -->";
const SKILL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function sanitizeSegment(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Names are chosen by the agent, not derived from the host. A name built from
 * the URL describes the source document; a skill should be named for the job it
 * does. This only enforces the shape.
 */
export function validateSkillName(name: string): string | null {
  if (!name) return "A skill name is required.";
  if (name.length > MAX_NAME_LENGTH) {
    return `A skill name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    return "A skill name must be lowercase kebab-case: start with a letter, then letters, digits and single hyphens.";
  }
  return null;
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
  failed?: string[];
  exclude?: string[];
  now?: string;
}): WriteResult {
  const { dir, name, source, mode, pages, failed = [], exclude = [] } = options;
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
    ...(exclude.length ? { exclude } : {}),
    pages: plain,
    ...(failed.length ? { failed } : {}),
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

  return {
    dir,
    entries: plain,
    keptSkillFile,
    refreshedTable,
    removed,
    diff: diffAgainstPrevious(previous, plain),
  };
}

/** Read the record a previous run left, or null when the directory is not ours. */
export function readSkillSources(dir: string): Sources | null {
  return readSources(dir);
}

/**
 * skm requires the folder basename and the frontmatter `name` to match, so a
 * rename has to touch both. Only the frontmatter line is rewritten — the rest
 * of an authored SKILL.md belongs to whoever wrote it.
 */
export function applySkillName(dir: string, name: string): { bodyMentionsOldName: boolean } {
  const sources = readSources(dir);
  const previousName = sources?.name;
  if (sources) {
    sources.name = name;
    writeFileSync(join(dir, SOURCES_FILE), `${JSON.stringify(sources, null, 2)}\n`);
  }

  const skillPath = join(dir, "SKILL.md");
  if (!existsSync(skillPath)) return { bodyMentionsOldName: false };
  const current = readFileSync(skillPath, "utf-8");
  const renamed = current.replace(/^name:[^\n]*$/m, `name: ${name}`);
  writeFileSync(skillPath, renamed);

  const body = renamed.replace(/^name:[^\n]*$/m, "");
  return {
    bodyMentionsOldName: Boolean(previousName && previousName !== name && body.includes(previousName)),
  };
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  pages: number;
  failed: string[];
}

const PLACEHOLDER_MARKERS = [
  "Edit\n  this description",
  "Reference material captured from",
];

/**
 * Static checks only. Nothing here can tell whether an authored claim is true —
 * that is what the sourcing rule in the skill is for — but it does catch a
 * routing table that points at files which are not there.
 */
export function validateSkillDirectory(dir: string): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sources = readSources(dir);
  if (!sources) {
    return {
      errors: [`${dir} has no references/sources.json; it was not produced by s1 learn.`],
      warnings,
      pages: 0,
      failed: [],
    };
  }

  const skillPath = join(dir, "SKILL.md");
  if (!existsSync(skillPath)) {
    errors.push("SKILL.md is missing.");
    return { errors, warnings, pages: sources.pages.length, failed: sources.failed ?? [] };
  }
  const skill = readFileSync(skillPath, "utf-8");

  const basename = dir.replace(/\/+$/, "").split(/[/\\]/).pop() ?? "";
  const declared = /^name:[ \t]*(\S+)[ \t]*$/m.exec(skill)?.[1];
  const nameError = validateSkillName(declared ?? "");
  if (nameError) errors.push(`SKILL.md frontmatter name: ${nameError}`);
  if (declared && declared !== basename) {
    errors.push(`SKILL.md declares name "${declared}" but the directory is "${basename}".`);
  }
  if (declared && declared !== sources.name) {
    errors.push(`SKILL.md declares name "${declared}" but sources.json records "${sources.name}".`);
  }
  if (!/^description:/m.test(skill)) errors.push("SKILL.md frontmatter has no description.");
  for (const marker of PLACEHOLDER_MARKERS) {
    if (skill.includes(marker)) {
      warnings.push("SKILL.md still contains generated placeholder wording; write the real triggers.");
      break;
    }
  }
  if (!skill.includes(TABLE_START) || !skill.includes(TABLE_END)) {
    warnings.push("The reference table markers are gone; a refresh can no longer update the table in place.");
  }

  // Every recorded page is on disk, and nothing on disk is unrecorded.
  const recorded = new Set(sources.pages.map((page) => page.file));
  for (const page of sources.pages) {
    if (!existsSync(join(dir, page.file))) errors.push(`${page.file} is recorded but missing.`);
  }
  const referencesDir = join(dir, "references");
  if (existsSync(referencesDir)) {
    for (const entry of readdirSync(referencesDir)) {
      if (!entry.endsWith(".md")) continue;
      if (!recorded.has(`references/${entry}`)) {
        warnings.push(`references/${entry} is on disk but not recorded in sources.json.`);
      }
    }
  }

  // Links the routing layer points at must exist.
  const linkPattern = /\((references\/[^)\s]+\.md)\)/g;
  let match = linkPattern.exec(skill);
  const missing = new Set<string>();
  while (match !== null) {
    if (!existsSync(join(dir, match[1]))) missing.add(match[1]);
    match = linkPattern.exec(skill);
  }
  for (const file of missing) errors.push(`SKILL.md links ${file}, which does not exist.`);

  if (sources.failed?.length) {
    warnings.push(`${sources.failed.length} page(s) failed to crawl and are missing from this skill.`);
  }

  return { errors, warnings, pages: sources.pages.length, failed: sources.failed ?? [] };
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

/** Whole-segment prefix match, so `/docs/cloud` never matches `/docs/cloudy`. */
export function isUnderPath(url: string, prefix: string): boolean {
  const normalized = `/${prefix.trim().replace(/^\/+|\/+$/g, "")}`;
  if (normalized === "/") return true;
  let path: string;
  try {
    path = new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
  return path === normalized || path.startsWith(`${normalized}/`);
}

/** `--exclude /docs/cloud` drops that section. */
export function matchesExclude(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const normalized = `/${pattern.trim().replace(/^\/+|\/+$/g, "")}`;
    return normalized !== "/" && isUnderPath(url, normalized);
  });
}

export interface SiteSelection {
  urls: string[];
  discovered: number;
  excluded: number;
  overCap: number;
}

/**
 * `/sitemap` now returns what the site publishes, so selection is ordering and
 * exclusion — not the multi-round link chasing this used to need.
 */
export function selectSiteUrls(options: {
  links: string[];
  source: string;
  exclude?: string[];
  maxPages: number;
}): SiteSelection {
  const { links, source, exclude = [], maxPages } = options;
  // `--site` means the site under the URL you pointed at. Point at the docs
  // root for the whole site, or at a section to learn just that section.
  const scope = new URL(source).pathname;
  const candidates = normalizeCandidates([source, ...links], source).filter((url) =>
    isUnderPath(url, scope)
  );
  const kept = candidates.filter((url) => !matchesExclude(url, exclude));
  const ranked = rankUrls(kept, source);
  return {
    urls: ranked.slice(0, Math.max(1, maxPages)),
    discovered: candidates.length,
    excluded: candidates.length - kept.length,
    overCap: Math.max(0, ranked.length - Math.max(1, maxPages)),
  };
}

export interface Section {
  path: string;
  count: number;
}

/**
 * Group the selection one level below the requested path so the agent can see
 * the shape of the site — and exclude a whole section — before anything is
 * crawled.
 */
export function summarizeSections(urls: string[], source: string): Section[] {
  const prefix = new URL(source).pathname.replace(/\/+$/, "") || "/";
  const depth = prefix.split("/").filter(Boolean).length;
  const counts = new Map<string, number>();

  for (const url of urls) {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const key =
      isUnderPath(url, prefix) && segments.length > depth
        ? `/${segments.slice(0, depth + 1).join("/")}`
        : prefix;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // A lone page is not a section. Roll singletons up into the requested path,
  // otherwise a flat doc site reports fifty "sections" of one page each.
  let rolledUp = 0;
  const sections: Section[] = [];
  for (const [path, count] of counts) {
    if (path !== prefix && count < 2) rolledUp += count;
    else sections.push({ path, count });
  }
  if (rolledUp > 0) {
    const existing = sections.find((section) => section.path === prefix);
    if (existing) existing.count += rolledUp;
    else sections.push({ path: prefix, count: rolledUp });
  }

  return sections.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}

export interface RefreshDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: number;
}

/** What moved since the last run, from hashes we already compute. */
export function diffAgainstPrevious(
  previous: Sources | null,
  entries: SourceEntry[]
): RefreshDiff | null {
  if (!previous) return null;
  const before = new Map(previous.pages.map((page) => [page.url, page.hash]));
  const added: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const entry of entries) {
    const hash = before.get(entry.url);
    if (hash === undefined) added.push(entry.url);
    else if (hash !== entry.hash) changed.push(entry.url);
    else unchanged += 1;
    before.delete(entry.url);
  }

  return { added, changed, removed: [...before.keys()], unchanged };
}
