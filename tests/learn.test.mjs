import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const {
  applySkillName,
  bindInstalledSkill,
  hasPlaceholderDescription,
  diffAgainstPrevious,
  installStagedSkill,
  isLearnedDirectory,
  matchesExclude,
  readSkillSources,
  referenceFilename,
  renderReference,
  renderReferenceTable,
  selectSiteUrls,
  spliceReferenceTable,
  summarizeSections,
  validateSkillDirectory,
  validateSkillName,
  writeSkillDirectory,
} = await import("../dist/learn.js");

function tempDir() {
  return mkdtempSync(join(tmpdir(), "s1-learn-"));
}

/** Stand in for the authoring step: replace the generated description. */
function authorDescription(dir) {
  const path = join(dir, "SKILL.md");
  writeFileSync(
    path,
    readFileSync(path, "utf-8").replace(
      /description: >[\s\S]*?\n---/,
      "description: Real triggers written by the agent.\n---"
    )
  );
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

test("site selection scopes to the path you pointed at", () => {
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
    maxPages: 2,
  });

  // off-origin dropped, /other dropped, anchor and trailing slash deduped
  assert.equal(selection.discovered, 3);
  assert.equal(selection.overCap, 1);
  assert.deepEqual(selection.urls, [
    "https://docs.example.com/guide",
    "https://docs.example.com/guide/b",
  ]);

  // Pointing at the root keeps everything on the host.
  const whole = selectSiteUrls({
    links: ["https://docs.example.com/other/deep/page", "https://docs.example.com/guide/a"],
    source: "https://docs.example.com/",
    maxPages: 50,
  });
  assert.equal(whole.discovered, 3);

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

test("renaming keeps the folder, frontmatter and sources.json in agreement", () => {
  const staged = tempDir();
  writeSkillDirectory({
    dir: staged,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: PAGES,
    now: "2026-01-01T00:00:00.000Z",
  });

  const installed = join(tempDir(), "example-write-guides");
  installStagedSkill(staged, installed);
  const { bodyMentionsOldName } = applySkillName(installed, "example-write-guides");

  const skill = readFileSync(join(installed, "SKILL.md"), "utf-8");
  assert.match(skill, /^name: example-write-guides$/m);
  assert.doesNotMatch(skill, /^name: docs-example$/m);
  assert.equal(
    JSON.parse(readFileSync(join(installed, "references/sources.json"), "utf-8")).name,
    "example-write-guides"
  );
  // The generated body names the skill in its heading, and that is the user's
  // prose to fix — but they have to be told.
  assert.equal(bodyMentionsOldName, true);

  // The generated description is an error until someone writes a real one.
  assert.match(
    validateSkillDirectory(installed).errors.join(" "),
    /will not trigger/
  );
  authorDescription(installed);
  assert.deepEqual(validateSkillDirectory(installed).errors, []);
});

test("the scope of a run is recorded so a refresh keeps it", () => {
  const dir = tempDir();
  writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: PAGES,
    exclude: ["/guide/cloud"],
    now: "2026-01-01T00:00:00.000Z",
  });
  const sources = readSkillSources(dir);
  assert.deepEqual(sources.exclude, ["/guide/cloud"]);
  assert.equal(sources.source, "https://docs.example.com/guide");
  assert.equal(sources.mode, "site");
});

test("validation catches a routing table that points at nothing", () => {
  const dir = join(tempDir(), "docs-example");
  mkdirSync(dir, { recursive: true });
  writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: PAGES,
    failed: ["https://docs.example.com/guide/broken"],
    now: "2026-01-01T00:00:00.000Z",
  });
  authorDescription(dir);
  assert.deepEqual(validateSkillDirectory(dir).errors, []);
  // A failed page is a gap, not a defect: warn, do not fail.
  assert.match(validateSkillDirectory(dir).warnings.join(" "), /1 page\(s\) failed/);

  writeFileSync(
    join(dir, "SKILL.md"),
    readFileSync(join(dir, "SKILL.md"), "utf-8") +
      "\nSee [references/does-not-exist.md](references/does-not-exist.md).\n"
  );
  rmSync(join(dir, "references/guide-start.md"));

  const report = validateSkillDirectory(dir);
  assert.ok(report.errors.some((e) => /does-not-exist\.md, which does not exist/.test(e)));
  assert.ok(report.errors.some((e) => /guide-start\.md is recorded but missing/.test(e)));

  assert.match(
    validateSkillDirectory(join(tempDir(), "not-a-skill")).errors[0],
    /not produced by s1 learn/
  );
});

test("a skill that cannot trigger is an error, not a warning", () => {
  const dir = join(tempDir(), "docs-example");
  mkdirSync(dir, { recursive: true });
  writeSkillDirectory({
    dir,
    name: "docs-example",
    source: "https://docs.example.com/guide",
    mode: "site",
    pages: PAGES,
    now: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(hasPlaceholderDescription(dir), true);
  const before = validateSkillDirectory(dir);
  assert.ok(before.errors.some((e) => /will not trigger/.test(e)));

  authorDescription(dir);
  assert.equal(hasPlaceholderDescription(dir), false);
  assert.deepEqual(validateSkillDirectory(dir).errors, []);
});

test("installing links the skill into agent directories that exist", () => {
  const home = tempDir();
  const store = join(home, ".agents", "skills", "docs-example");
  mkdirSync(store, { recursive: true });
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  // .cursor/skills deliberately absent: we never create a directory for a tool
  // the user has not set up.

  const previousCwd = process.cwd();
  process.chdir(home);
  try {
    // macOS resolves /var to /private/var, so anchor on the resolved cwd.
    const root = process.cwd();
    const link = join(root, ".claude", "skills", "docs-example");

    const bindings = bindInstalledSkill("project", "docs-example", store);
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].linked, true);
    assert.equal(bindings[0].path, link);
    assert.equal(existsSync(join(root, ".cursor", "skills")), false);

    // Running again is idempotent, and never replaces someone else's entry.
    assert.deepEqual(bindInstalledSkill("project", "docs-example", store), [
      { path: link, linked: true, reason: "already linked" },
    ]);

    rmSync(link);
    writeFileSync(link, "someone else\n");
    const blocked = bindInstalledSkill("project", "docs-example", store);
    assert.equal(blocked[0].linked, false);
    assert.match(blocked[0].reason, /already there/);
  } finally {
    process.chdir(previousCwd);
  }
});
