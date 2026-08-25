import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const {
  diffAgainstPrevious,
  installStagedSkill,
  isLearnedDirectory,
  matchesExclude,
  referenceFilename,
  renderReference,
  renderReferenceTable,
  selectSiteUrls,
  spliceReferenceTable,
  summarizeSections,
  validateSkillName,
  writeSkillDirectory,
} = await import("../dist/learn.js");

function tempDir() {
  return mkdtempSync(join(tmpdir(), "s1-learn-"));
}

const PAGES = [
  { url: "https://docs.example.com/guide/start", title: "Start", content: "# Start\n\nhello" },
  { url: "https://docs.example.com/guide-start", title: "Guide Start", content: "# Other\n\nworld" },
];

test("skill names are validated, not derived", () => {
  assert.equal(validateSkillName("umami-analytics"), null);
  assert.equal(validateSkillName("seo-audit"), null);
  assert.equal(validateSkillName("s1"), null);

  assert.match(validateSkillName(""), /required/);
  assert.match(validateSkillName("Umami"), /lowercase kebab-case/);
  assert.match(validateSkillName("umami_analytics"), /lowercase kebab-case/);
  assert.match(validateSkillName("-umami"), /lowercase kebab-case/);
  assert.match(validateSkillName("umami--analytics"), /lowercase kebab-case/);
  assert.match(validateSkillName("9lives"), /lowercase kebab-case/);
  assert.match(validateSkillName("a".repeat(65)), /64 characters/);
});

test("reference filenames come from the path and never collide", () => {
  const taken = new Set();
  assert.equal(referenceFilename("https://a.test/guide/start", taken), "guide-start.md");
  assert.equal(referenceFilename("https://a.test/guide-start", taken), "guide-start-2.md");
  assert.equal(referenceFilename("https://a.test/", taken), "index.md");
});

test("references carry title/url frontmatter", () => {
  const rendered = renderReference({
    url: "https://a.test/x",
    title: 'A "quoted" title',
    content: "body\n",
  });
  assert.match(rendered, /^---\ntitle: "A \\"quoted\\" title"\nurl: https:\/\/a\.test\/x\n---\n\nbody\n$/);
});

test("writing a skill directory produces SKILL.md, references and sources.json", () => {
  const dir = tempDir();
  const result = writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: PAGES,
    now: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(result.keptSkillFile, false);
  assert.deepEqual(
    result.entries.map((entry) => entry.file),
    ["references/guide-start.md", "references/guide-start-2.md"]
  );
  assert.match(readFileSync(join(dir, "SKILL.md"), "utf-8"), /^---\nname: docs-example\n/);
  assert.match(readFileSync(join(dir, "references/guide-start.md"), "utf-8"), /url: https:\/\/docs\.example\.com\/guide\/start/);

  const sources = JSON.parse(readFileSync(join(dir, "references/sources.json"), "utf-8"));
  assert.equal(sources.version, 1);
  assert.equal(sources.source, "https://docs.example.com/guide");
  assert.equal(sources.pages.length, 2);
  assert.match(sources.pages[0].hash, /^sha256:[0-9a-f]{64}$/);
  assert.ok(isLearnedDirectory(dir));
});

test("refreshing keeps an edited SKILL.md and drops pages that vanished", () => {
  const dir = tempDir();
  writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: PAGES,
    now: "2026-01-01T00:00:00.000Z",
  });
  writeFileSync(join(dir, "SKILL.md"), "edited by the user\n");

  const refreshed = writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: [PAGES[0]],
    now: "2026-01-02T00:00:00.000Z",
  });

  assert.equal(refreshed.keptSkillFile, true);
  assert.equal(refreshed.refreshedTable, false); // no markers in a hand-written file
  assert.deepEqual(refreshed.removed, ["references/guide-start-2.md"]);
  assert.equal(readFileSync(join(dir, "SKILL.md"), "utf-8"), "edited by the user\n");
  assert.equal(existsSync(join(dir, "references/guide-start-2.md")), false);
});

test("an untouched SKILL.md is regenerated so its reference table stays honest", () => {
  const dir = tempDir();
  writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: PAGES,
    now: "2026-01-01T00:00:00.000Z",
  });
  assert.match(readFileSync(join(dir, "SKILL.md"), "utf-8"), /guide-start-2\.md/);

  const refreshed = writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: [PAGES[0]],
    now: "2026-01-02T00:00:00.000Z",
  });

  assert.equal(refreshed.keptSkillFile, false);
  assert.doesNotMatch(readFileSync(join(dir, "SKILL.md"), "utf-8"), /guide-start-2\.md/);
});

test("install never overwrites a directory s1 learn did not write", () => {
  const staged = tempDir();
  writeSkillDirectory({
    dir: staged,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: PAGES,
    now: "2026-01-01T00:00:00.000Z",
  });

  const fresh = join(tempDir(), "docs-example");
  assert.deepEqual(installStagedSkill(staged, fresh), { keptSkillFile: false, refreshedTable: false });
  assert.ok(existsSync(join(fresh, "references/sources.json")));

  // Re-installing over an untouched copy refreshes everything, table included.
  const staged2 = tempDir();
  writeSkillDirectory({
    dir: staged2,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: [PAGES[0]],
    now: "2026-01-02T00:00:00.000Z",
  });
  assert.deepEqual(installStagedSkill(staged2, fresh), { keptSkillFile: false, refreshedTable: false });
  assert.doesNotMatch(readFileSync(join(fresh, "SKILL.md"), "utf-8"), /guide-start-2\.md/);
  assert.equal(existsSync(join(fresh, "references/guide-start-2.md")), false);

  // An edited SKILL.md survives the next install.
  writeFileSync(join(fresh, "SKILL.md"), "edited in place\n");
  assert.deepEqual(installStagedSkill(staged2, fresh), { keptSkillFile: true, refreshedTable: false });
  assert.equal(readFileSync(join(fresh, "SKILL.md"), "utf-8"), "edited in place\n");

  const foreign = join(tempDir(), "someone-elses-skill");
  mkdirSync(foreign, { recursive: true });
  writeFileSync(join(foreign, "SKILL.md"), "not ours\n");
  assert.throws(() => installStagedSkill(staged, foreign), /Refusing to overwrite/);
});

test("site selection orders, excludes, and reports what the cap left out", () => {
  const selection = selectSiteUrls({
    links: [
      "https://docs.example.com/other/deep/page",
      "https://docs.example.com/guide/b",
      "https://elsewhere.test/guide/a",
      "https://docs.example.com/guide/a#anchor",
      "https://docs.example.com/guide/a",
      "https://docs.example.com/guide/",
    ],
    source: "https://docs.example.com/guide",
    maxPages: 3,
  });

  // off-origin dropped; anchor and trailing slash deduped
  assert.equal(selection.discovered, 4);
  assert.equal(selection.overCap, 1);
  assert.deepEqual(selection.urls, [
    "https://docs.example.com/guide",
    "https://docs.example.com/guide/b",
    "https://docs.example.com/guide/a",
  ]);

  const trimmed = selectSiteUrls({
    links: ["https://d.test/docs/a", "https://d.test/docs/cloud/x", "https://d.test/docs/cloud/y"],
    source: "https://d.test/docs",
    exclude: ["/docs/cloud"],
    maxPages: 50,
  });
  assert.equal(trimmed.excluded, 2);
  assert.deepEqual(trimmed.urls, ["https://d.test/docs", "https://d.test/docs/a"]);
});

test("matchesExclude only matches whole path segments", () => {
  assert.equal(matchesExclude("https://d.test/docs/cloud", ["/docs/cloud"]), true);
  assert.equal(matchesExclude("https://d.test/docs/cloud/x", ["docs/cloud"]), true);
  assert.equal(matchesExclude("https://d.test/docs/cloudy", ["/docs/cloud"]), false);
  assert.equal(matchesExclude("https://d.test/docs", []), false);
});

test("sections group below the requested path and roll up lone pages", () => {
  const sections = summarizeSections(
    [
      "https://d.test/docs",
      "https://d.test/docs/api",
      "https://d.test/docs/api/auth",
      "https://d.test/docs/api/websites",
      "https://d.test/docs/install",
      "https://d.test/docs/updates",
    ],
    "https://d.test/docs"
  );
  // /docs/install and /docs/updates are single pages, not sections.
  // Equal counts tie-break by path, so /docs sorts before /docs/api.
  assert.deepEqual(sections, [
    { path: "/docs", count: 3 },
    { path: "/docs/api", count: 3 },
  ]);
});

test("the refresh diff reports what actually moved", () => {
  const previous = {
    version: 1,
    name: "x",
    source: "https://d.test/docs",
    mode: "site",
    learnedAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { file: "references/a.md", url: "https://d.test/a", title: "A", hash: "sha256:1" },
      { file: "references/b.md", url: "https://d.test/b", title: "B", hash: "sha256:2" },
      { file: "references/c.md", url: "https://d.test/c", title: "C", hash: "sha256:3" },
    ],
  };
  const diff = diffAgainstPrevious(previous, [
    { file: "references/a.md", url: "https://d.test/a", title: "A", hash: "sha256:1" },
    { file: "references/b.md", url: "https://d.test/b", title: "B", hash: "sha256:CHANGED" },
    { file: "references/d.md", url: "https://d.test/d", title: "D", hash: "sha256:4" },
  ]);

  assert.deepEqual(diff, {
    added: ["https://d.test/d"],
    changed: ["https://d.test/b"],
    removed: ["https://d.test/c"],
    unchanged: 1,
  });
  assert.equal(diffAgainstPrevious(null, []), null);
});

test("failed URLs are recorded so the gap is visible", () => {
  const dir = tempDir();
  writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: [PAGES[0]],
    failed: ["https://docs.example.com/guide/broken"],
    now: "2026-01-01T00:00:00.000Z",
  });
  const sources = JSON.parse(readFileSync(join(dir, "references/sources.json"), "utf-8"));
  assert.deepEqual(sources.failed, ["https://docs.example.com/guide/broken"]);
});
