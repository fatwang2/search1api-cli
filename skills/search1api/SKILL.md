---
name: search1api
description: >
  Live web search, page retrieval, news, sitemap discovery, trending topics, and turning a URL into a reusable Agent Skill — all through Search1API. Use this skill whenever the user wants to search the web, look something up, research a topic, read or summarize a URL, check current news, explore a site's links, see trending topics, check API balance, or teach an agent a URL so it can be used later. Trigger on phrases like "search for", "look up", "find out about", "what's happening with", "any news on", "what does this link say", "read this page", "summarize this URL", "trending on GitHub", "learn this URL", "learn this site", "turn these docs into a skill", "记住这个链接", "学会这个文档", or when the user shares a bare URL. Prefer the bundled Search1API MCP tools when available and fall back to the search1api CLI (`s1`).
metadata: {"openclaw": {"requires": {"bins": ["s1"]}}}
---

# Search1API

Live web research through the bundled Search1API MCP server or the `s1`
command-line tool.

## Choose the available transport

1. Prefer the connected Search1API MCP tools. They may be namespaced by the
   host, but their final tool names are `search`, `fetch`, `news`, `crawl`,
   `sitemap`, and `trending`.
2. If the MCP tools are unavailable, check whether `s1` is installed and use
   the matching CLI command.
3. If neither transport is available, ask the user to connect the bundled MCP
   server or install the CLI:

```bash
curl -fsSL https://cli.search1api.com/install.sh | bash
```

Or via npm:

```bash
npm install -g search1api-cli
```

Do not install software or switch transports when a working Search1API tool is
already available. To update an existing CLI install, the user can run
`s1 update`. Only suggest this when a command fails in a version-related way.

The remote MCP server handles authentication through the host's connection
flow. If the host reports that authentication is required, ask the user to
connect or re-authenticate Search1API.

For CLI authentication, prefer browser login:

```bash
s1 login
```

Manual fallback:

```bash
s1 config set-key <your-api-key>
```

You can also set the environment variable `SEARCH1API_KEY`.

If a CLI command fails with "command not found" or an auth error, remind the
user to install `s1` and run `s1 login` before retrying.

## When to use

| User intent | MCP tool | CLI fallback |
|---|---|---|
| Shares a URL / link → read and summarize | `crawl` | `s1 crawl <url>` |
| Wants to search the web | `search` | `s1 search "<query>"` |
| Wants the full page behind a search result | `fetch` with its result `id` | `s1 crawl <url>` |
| Wants news | `news` | `s1 news "<query>"` |
| Wants to explore a site's links | `sitemap` | `s1 sitemap <url>` |
| Wants trending topics | `trending` | `s1 trending <service>` |
| Wants to check remaining credits | Not exposed | `s1 balance` |
| Wants an agent to *keep* a URL for later use | Not exposed | `s1 learn <url>` |

### Read it once, or learn it for good?

These look similar and are not:

- "What does this page say?", "summarize this link", "read these docs and
  answer X" → **`crawl`**. One page, answer now, nothing written to disk.
- "Learn this URL", "make a skill out of these docs", "记住这个文档" → **`learn`**.
  Produces an installable skill directory the user's agent can load later.
- Only add **`--site`** when the user clearly means the whole site or section
  ("learn the whole docs", "整站"). When the scope is unclear, run `--discover`
  first and show the user what a full run would cover.

## Dynamic tuning

Adapt parameters to user intent — don't just use defaults:

- **Quick lookup** ("search for X", "what is X") → `-n 5`, no crawl
- **Deep research** ("research X thoroughly", "comprehensive analysis") → `-n 15`, then crawl top 3–5 results with separate `s1 crawl` calls
- **User specifies a number** ("find 10 articles") → match it with `-n`
- **Recency signals** ("latest", "recent", "this week") → `-t day` or `-t month`
- **Domain-specific** ("search on Reddit", "find GitHub repos") → `-s reddit`, `-s github`, etc.
- **Site-scoped** ("only from arxiv.org") → `--include arxiv.org`
- **Chinese queries** → use `google`, `bing`, `wechat`, or `bilibili` according to intent

For MCP calls, map the CLI flags above to their schema equivalents:
`max_results`, `search_service`, `crawl_results`, `include_sites`,
`exclude_sites`, and `time_range`.

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

1. Use `search` (or `s1 search "<topic>" -n 15`) to get broad results
2. Use `fetch` with result IDs (or `s1 crawl <url>`) for the top 3–5 relevant pages
3. Synthesize all gathered content into a coherent answer with source citations

### Learning a URL into a skill

The user must confirm before anything lands on disk. Never install in the same
breath as the crawl.

1. Decide the scope. Default to the single page. Only use `--site` when the user
   means the whole site or section.
2. For a site, run `s1 learn <url> --site --discover --json` first. It crawls
   nothing and returns the section breakdown and the page count.
3. Choose a name from what you saw (see naming above) and report the plan: name,
   sections, and page count.
4. Decide what to leave out, and check before you do. Most doc sets carry a
   section that is dead weight for half their readers — hosted versus
   self-hosted, one platform's deploy guide out of twenty, contributor and
   governance pages, changelogs. Ask the user which flavour applies.
   **A section is not automatically homogeneous.** Before excluding one, look
   inside it: `s1 learn <url-of-that-section> --site --discover` lists what it
   holds. umami's `/docs/guides` is 33 pages of which 21 are hosting guides and
   11 are core how-tos for tracking outbound links, form submissions, SPAs and
   server-side events — excluding the section wholesale silently drops those.
   When a section is mixed, either keep it or exclude the individual pages.
   Whatever you exclude, say so in the description, so the skill declares its
   own gaps.
5. Run `s1 learn <url> --site --name <name> --json`. It writes to a staging
   directory and installs nothing.
6. Tell the user what it captured and where it is, then ask: globally
   (`~/.agents/skills/`), in this project (`./.agents/skills/`), or leave it
   staged.
7. Only after they say yes, run
   `s1 learn --from <staged dir> --install <global|project>`. It makes no
   further requests.
8. Author the `SKILL.md` routing layer under the rules above. An existing
   directory `s1 learn` did not create is never overwritten.
9. Rewrite the description before calling it done. `s1 learn` leaves a
   placeholder, and a skill carrying it will not be selected by an agent — the
   command says so, and `--validate` fails on it. Installing also links the skill
   into the agent directories that already exist next to the store; the output
   names them, and says so when it found none.
10. Run `s1 learn --validate <installed dir>` and fix what it reports. It checks
   that the name agrees everywhere, that every recorded page is on disk, and
   that every `references/…` link in your routing table resolves. It cannot
   check whether a claim you wrote is true — that is what the sourcing rule
   above is for.

If pages failed, they are listed in the output and recorded in
`references/sources.json`. Say which ones, so the user knows what the skill is
missing rather than assuming it is complete.

### URL summarization

1. `s1 crawl <url>` → get the page content
2. Summarize or answer questions based on the content

### Trending deep dive

1. `s1 trending github -n 10` → discover hot topics
2. `s1 search "<interesting topic>" -t day` → search for details
3. `s1 crawl <url>` → read full article if needed

## Output handling

- CLI commands produce human-readable output by default; add `--json` for
  programmatic processing.
- After retrieving results, summarize and synthesize the information instead
  of dumping raw output.
- Preserve source URLs and cite the relevant pages in the final answer.
- Distinguish facts found in sources from your own inference.

## References

- [Usage examples](reference/examples.md) — read for additional patterns
