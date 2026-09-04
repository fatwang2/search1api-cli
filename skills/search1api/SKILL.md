---
name: search1api
description: >
  Live web search, page retrieval, news, sitemap discovery, trending topics, and turning a URL into a reusable Agent Skill — all through the Search1API CLI (`s1`). Use this skill whenever the user wants to search the web, look something up, research a topic, read or summarize a URL, check current news, explore a site's links, see trending topics, check API balance, or teach an agent a URL so it can be used later. Trigger on phrases like "search for", "look up", "find out about", "what's happening with", "any news on", "what does this link say", "read this page", "summarize this URL", "trending on GitHub", "learn this URL", "learn this site", "turn these docs into a skill", "记住这个链接", "学会这个文档", or when the user shares a bare URL.
---

# Search1API

Live web research through the `s1` command-line tool.

## Prerequisites

Every command in this skill runs through `s1`. Check that it is installed and
authenticated:

```bash
s1 balance
```

If the command is not found, install it:

```bash
curl -fsSL https://cli.search1api.com/install.sh | bash
```

Or via npm:

```bash
npm install -g search1api-cli
```

Then authenticate — prefer browser login, so no key is pasted into the
conversation:

```bash
s1 login
```

Manual fallback:

```bash
s1 config set-key <your-api-key>
```

You can also set the environment variable `SEARCH1API_KEY`.

Do not install anything when `s1` already works. To update an existing install,
the user can run `s1 update` — only suggest this when a command fails in a
version-related way.

If `s1` is not found after installing, check that the npm global bin directory
is on `PATH`. `npx -y search1api-cli <command>` works as a fallback without any
install:

```bash
npx -y search1api-cli balance
```

**Auth and credit errors are terminal.** When a command reports an invalid key
or insufficient credits, confirm the state once with `s1 balance`, then tell the
user what is blocking and stop. Retrying the same command returns the same
error.

## When to use

| User intent | Command |
|---|---|
| Shares a URL / link → read and summarize | `s1 crawl <url>` |
| Wants to search the web | `s1 search "<query>"` |
| Wants the full page behind a search result | `s1 crawl <url>` |
| Wants news | `s1 news "<query>"` |
| Wants to explore a site's links | `s1 sitemap <url>` |
| Wants trending topics | `s1 trending <service>` |
| Wants to check remaining credits | `s1 balance` |
| Wants an agent to *keep* a URL for later use | `s1 learn <url>` |

### Read it once, or learn it for good?

These look similar and are not:

- "What does this page say?", "summarize this link", "read these docs and
  answer X" → **`s1 crawl`**. One page, answer now, nothing written to disk.
- "Learn this URL", "make a skill out of these docs", "记住这个文档" → **`s1 learn`**.
  Produces an installable skill directory the user's agent can load later.
- **Scope follows the request.** A single link is one page; a documentation set
  ("learn these docs", "学一下 XX 文档") is `--site` pointed at its root — that
  is the normal case, not an escalation. When it is genuinely unclear, run
  `--discover` and show the user what a full run would cover.

## Dynamic tuning

Adapt parameters to user intent — don't just use defaults:

- **Quick lookup** ("search for X", "what is X") → `-n 5`, no crawl
- **Deep research** ("research X thoroughly", "comprehensive analysis") → `-n 15`, then crawl top 3–5 results with separate `s1 crawl` calls
- **User specifies a number** ("find 10 articles") → match it with `-n`
- **Recency signals** ("latest", "recent", "this week") → `-t day` or `-t month`
- **Domain-specific** ("search on Reddit", "find GitHub repos") → `-s reddit`, `-s github`, etc.
- **Site-scoped** ("only from arxiv.org") → `--include arxiv.org`
- **Chinese queries** → use `google`, `bing`, `wechat`, or `bilibili` according to intent

## Commands

### search

```bash
s1 search "<query>" [options]
```

| Option | Description | Default |
|---|---|---|
| `-n, --max-results <N>` | Number of results (1–50) | 10 |
| `-s, --service <engine>` | Search engine | google |
| `-c, --crawl <N>` | Crawl N results for full content | 0 |
| `--include <sites...>` | Only include these sites | |
| `--exclude <sites...>` | Exclude these sites | |
| `-t, --time <range>` | day, month, year | |
| `--json` | Raw JSON output | |

Search engines: google, bing, duckduckgo, yahoo, x, reddit, github, youtube, arxiv, wechat, bilibili, imdb, wikipedia

### news

```bash
s1 news "<query>" [options]
```

Same options as search. News services: google, bing, duckduckgo, yahoo, hackernews. Default service: bing.

When user asks for breaking/latest news, always add `-t day`.

### crawl

```bash
s1 crawl <url>
```

Extracts clean content from a URL. Use this whenever the user shares a link.

### sitemap

```bash
s1 sitemap <url>
```

Returns all discovered links on a URL/domain.

### trending

```bash
s1 trending <service> [-n <N>]
```

Services: github, hackernews.

### learn

```bash
s1 learn <url> --name <name> [--site] [--exclude <paths...>] [--out <dir>]
s1 learn <url> --site --discover          # list what would be learned; crawls nothing
s1 learn --from <dir> --install <global|project> [--name <new-name>]
s1 learn --refresh <dir>                  # relearn using the source and scope it recorded
s1 learn --validate <dir>                 # static checks on a learned directory
```

Turns a URL into an Agent Skill directory:

```
<name>/
  SKILL.md                 # routing layer: when to use, what is in references/
  references/*.md          # page content with title/url frontmatter
  references/sources.json  # source URLs, hashes, and any pages that failed
```

| Option | Description | Default |
|---|---|---|
| `--name <name>` | **Required.** You choose it — see naming below | |
| `--site` | Learn everything under the URL's path, not just that page | off |
| `--discover` | With `--site`: print the section breakdown and stop | off |
| `--exclude <paths...>` | Path prefixes to leave out, e.g. `--exclude /docs/cloud` | |
| `--max-pages <N>` | Safety valve, not a knob to tune | 500 |
| `--out <dir>` | Where to write it | staging dir under the cache |
| `--from <dir>` | Install an already-learned directory (no crawl) | |
| `--refresh <dir>` | Relearn using the source, mode and `--exclude` it recorded | |
| `--validate <dir>` | Report problems in a learned directory, exit 1 on errors | |
| `--install <scope>` | `global` (`~/.agents/skills/`) or `project` (`./.agents/skills/`) | not installed |
| `--json` | Raw JSON output | |

`--site` learns what lives **under the URL you point at**: the docs root gets
the whole set, `/docs/api` gets just that section.

**One learn produces one skill, and one bundle per site is the default.** Do not
split a documentation set you are meeting for the first time. Before crawling
you know only the URLs, and grouping pages by their slugs is a guess that goes
wrong on exactly the pages that matter: on umami's docs, `links`, `pixels` and
`tags` read like reporting features and are all instrumentation. What a page
actually covers is knowable only after it has been crawled — at which point you
already hold one complete bundle, and its routing table does the routing that
separate skills would have done.

Point `--site` at a single section instead of the root only when that section is
plainly its own job *and* you can already tell — a REST API reference under
`/docs/api`, an SDK under `/sdk`. When in doubt, take the whole set.

`--discover` crawls nothing; it only reads what the site publishes, so use it
to size a job before running it.

#### Name it after you have seen it

`--discover` gives you paths, not titles, and titles are what tell you whether a
bundle is one job or four. When a site is unfamiliar, learn it under a working
name, read the titles in `references/sources.json`, then rename on install:

```bash
s1 learn --from <staged dir> --name <real-name> --install global
```

That rewrites the folder, the frontmatter and `sources.json` together, and warns
you if the body still mentions the old name.

#### Naming is yours to choose

`s1 learn` will not invent a name — it has only the URL, which is the one thing
that should not decide the name.

The hard rules are just the shape: lowercase kebab-case, 64 characters or fewer,
starting with a letter, and the folder basename must equal the frontmatter
`name`. `--validate` checks those.

Everything else is judgement, and the user's judgement wins. Reuse the prefix of
related skills they already have (`ls ~/.agents/skills`). Think about what else
might live alongside it: `umami-docs` is a good name precisely when a separate
skill about analytics practice could exist for the same product, and
`hono-build-api` is a good name when nothing else will. Ask the user if two
readings are both defensible — they know what their skill library looks like.

#### Writing the SKILL.md

The generated `SKILL.md` is a deterministic skeleton — no model writes it.
Replace the placeholder description with real trigger wording, and turn the page
list into a task-to-page routing table so the reader knows which file answers
which question. Until that description is rewritten the skill will not be
selected by an agent, and `--validate` fails on it.

**Read the pages you need.** Deciding what a section contains, what to exclude,
what to call the skill, and what to put in the routing table all require knowing
what is actually in the files — the URLs alone will mislead you. What to avoid
is dumping the corpus into the conversation: read the pages that inform a
decision, not all of them.

**State no fact you have not read.** The moment you write a concrete claim — a
header name, a base URL, a flag, a limit — open that reference file first and
cite it (`Source: references/<file>.md`). Writing API details from memory into a
skill whose whole purpose is to be sourced is the one failure this command
cannot survive.

Relearning the same URL rewrites `references/`, reports what changed, and keeps
a `SKILL.md` you have edited while refreshing its reference table in place.

### balance

```bash
s1 balance
```

Shows remaining API credits.

## Workflows

### Deep research

1. `s1 search "<topic>" -n 15` for broad results
2. `s1 crawl <url>` on the top 3–5 relevant pages
3. Synthesize all gathered content into a coherent answer with source citations

### Learning a URL into a skill

Nothing lands on disk until the user confirms, and nothing is installed until it
is worth installing. Work in this order — scope decides coverage, coverage
decides the name and the description, and all of that has to be settled before
anything is installed.

**Plan**

1. Settle the scope. "Read this link" is one page. "Learn these docs", "学一下
   XX 文档" is the set: `--site`, pointed at the docs root. Point at a single
   section instead only when the user asked for that section, or when that
   section is plainly its own job.
2. `s1 learn <url> --site --discover --json` — crawls nothing, returns the
   section breakdown and every URL it would learn.
3. Decide what to leave out. Most doc sets carry a section that is dead weight
   for half their readers: hosted versus self-hosted, one platform's deploy
   guide out of twenty, contributor and governance pages, changelogs. Ask the
   user which flavour applies.
   **A section is not automatically homogeneous.** Before excluding one, look
   inside: `s1 learn <url-of-that-section> --site --discover`. umami's
   `/docs/guides` is 33 pages of which 21 are hosting guides and 11 are core
   how-tos for tracking outbound links, form submissions, SPAs and server-side
   events — excluding it wholesale silently drops those. When a section is
   mixed, either keep it or exclude the individual pages.
4. `ls ~/.agents/skills` before naming. If something for this product already
   exists, compare the *job*, not the name: the same job means refresh that
   skill instead (step 10), a different job means the two names must say which
   is which. Then choose the name (see naming above) and report the plan to the
   user: name, sections, page count, and what you are excluding.

**Learn and author**

5. `s1 learn <url> --site --name <name> [--exclude <paths...>] --json`. It writes
   to a staging directory and installs nothing.
6. Author `SKILL.md` in the staging directory, before installing:
   - a description that names the topics and trigger phrasing, and **states what
     was excluded**, so the skill declares its own gaps;
   - a routing table by task, not by directory, so the reader does not have to
     understand the site's layout;
   - facts only from files you have read, cited.
7. `s1 learn --validate <staging dir>` and fix what it reports.

**Install**

8. Tell the user what it captured and where it is, then ask: globally
   (`~/.agents/skills/`), in this project (`./.agents/skills/`), or leave it
   staged for now.
9. Only after they say yes: `s1 learn --from <staging dir> --install
   <global|project>` — no further requests. Add `--name <name>` here to settle
   on a different name; it rewrites the folder, the frontmatter and
   `sources.json` together. Installing also links the skill into the agent
   directories that already exist beside the store, and the output names them —
   read that line, because a skill in the store that no agent is linked to is
   invisible. Run `s1 learn --validate <installed dir>` afterwards too — if you
   renamed on install, the installed copy is the only place the folder name and
   the frontmatter can be checked against each other.

**Maintain**

10. Later, `s1 learn --refresh <dir>` relearns from the source, mode and
    `--exclude` it recorded — no arguments to remember. Pass `--exclude` to
    change the scope, and it is recorded for next time. A refresh rewrites
    `references/`, keeps a `SKILL.md` you have edited while refreshing its
    reference table in place, and reports what was added, changed or removed. If
    the scope changed, update the description to match — a description that
    still claims a section was excluded after you added it back is worse than no
    description.
11. Pages that failed after their retry are listed in the output and recorded in
    `references/sources.json`. Name them to the user rather than letting the
    skill look complete, and note that `--refresh` will try them again.

### URL summarization

1. `s1 crawl <url>` → get the page content
2. Summarize or answer questions based on the content

### Trending deep dive

1. `s1 trending github -n 10` → discover hot topics
2. `s1 search "<interesting topic>" -t day` → search for details
3. `s1 crawl <url>` → read full article if needed

## Output handling

- Commands produce human-readable output by default; add `--json` for
  programmatic processing.
- After retrieving results, summarize and synthesize the information instead
  of dumping raw output.
- Preserve source URLs and cite the relevant pages in the final answer.
- Distinguish facts found in sources from your own inference.

## References

- [Usage examples](reference/examples.md) — read for additional patterns
