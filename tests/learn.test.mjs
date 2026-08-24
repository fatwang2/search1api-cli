import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const {
  hostSlug,
  installStagedSkill,
  isLearnedDirectory,
  referenceFilename,
  renderReference,
  selectSiteUrls,
  skillName,
  writeSkillDirectory,
} = await import("../dist/learn.js");

function tempDir() {
  return mkdtempSync(join(tmpdir(), "s1-learn-"));
}

const PAGES = [
  { url: "https://docs.example.com/guide/start", title: "Start", content: "# Start\n\nhello" },
  { url: "https://docs.example.com/guide-start", title: "Guide Start", content: "# Other\n\nworld" },
];

test("skill and reference names stay short and collision-free", () => {
  assert.equal(hostSlug("docs.stripe.com"), "docs-stripe");
  assert.equal(hostSlug("www.example.com"), "example");
  assert.equal(skillName("https://docs.stripe.com/webhooks", "site"), "docs-stripe");
  assert.equal(skillName("https://docs.stripe.com/webhooks", "page"), "docs-stripe-webhooks");
  assert.equal(skillName("https://example.com/", "page"), "example");

  const taken = new Set();
  // `/guide/start` and `/guide-start` flatten to the same base name.
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
  assert.deepEqual(installStagedSkill(staged, fresh), { keptSkillFile: false });
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
  assert.deepEqual(installStagedSkill(staged2, fresh), { keptSkillFile: false });
  assert.doesNotMatch(readFileSync(join(fresh, "SKILL.md"), "utf-8"), /guide-start-2\.md/);
  assert.equal(existsSync(join(fresh, "references/guide-start-2.md")), false);

  // An edited SKILL.md survives the next install.
  writeFileSync(join(fresh, "SKILL.md"), "edited in place\n");
  assert.deepEqual(installStagedSkill(staged2, fresh), { keptSkillFile: true });
  assert.equal(readFileSync(join(fresh, "SKILL.md"), "utf-8"), "edited in place\n");

  const foreign = join(tempDir(), "someone-elses-skill");
  mkdirSync(foreign, { recursive: true });
  writeFileSync(join(foreign, "SKILL.md"), "not ours\n");
  assert.throws(() => installStagedSkill(staged, foreign), /Refusing to overwrite/);
});

test("site selection prefers the requested section and shallower pages", () => {
  // Within the same depth the site's own sitemap order is kept.
  const { selected, discovered } = selectSiteUrls(
    [
      "https://docs.example.com/other/deep/page",
      "https://docs.example.com/guide/b",
      "https://elsewhere.test/guide/a",
      "https://docs.example.com/guide/a#anchor",
      "https://docs.example.com/guide/a",
      "https://docs.example.com/guide/",
    ],
    "https://docs.example.com/guide",
    3
  );

  // off-origin dropped; anchor and trailing slash deduped
  assert.equal(discovered, 4);
  assert.deepEqual(selected, [
    "https://docs.example.com/guide",
    "https://docs.example.com/guide/b",
    "https://docs.example.com/guide/a",
  ]);
});
