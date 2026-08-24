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
  ("learn the whole docs", "整站"). Scope is a billing decision — 1 credit for a
  page, roughly `1 + pages` for a site — so when it is unclear, ask before running.

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
s1 learn <url> [--site] [--max-pages <N>] [--name <name>] [--out <dir>]
s1 learn --from <dir> --install <global|project>
```

Turns a URL into an Agent Skill directory:

```
<name>/
  SKILL.md                 # routing layer: when to use, what is in references/
  references/*.md          # page content with title/url frontmatter
  references/sources.json  # source URLs and hashes, so it can be relearned
```

| Option | Description | Default |
|---|---|---|
| `--site` | Learn the whole site instead of the single page | off |
| `--max-pages <N>` | Page cap in `--site` mode | 20 |
| `--name <name>` | Skill directory name | derived from the host |
| `--out <dir>` | Where to write it | a staging dir under the cache |
| `--from <dir>` | Install an already-learned directory (no crawl, no credits) | |
| `--install <scope>` | `global` (`~/.agents/skills/`) or `project` (`./.agents/skills/`) | not installed |
| `--json` | Raw JSON output | |

Cost: a single page is 1 credit. `--site` is 1 credit for link discovery plus 1
per page crawled, so the default cap is about 21 credits. Nothing is installed
unless `--install` is passed.

`SKILL.md` is a deterministic skeleton — no model writes it. Rewrite its
description and triggers to fit how the user will actually invoke it. Relearning
the same URL rewrites `references/` and keeps a `SKILL.md` that has been edited.

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

1. Decide the scope. Default to the single page. If the user means a whole site
   and has not said so explicitly, ask first — it is the difference between
   1 credit and roughly 21.
2. Run `s1 learn <url> [--site] --json`. It writes to a staging directory and
   installs nothing.
3. Tell the user the skill name, how many pages it captured, and where it is.
4. Ask where it should go: globally (`~/.agents/skills/`), in this project
   (`./.agents/skills/`), or leave it staged for now.
5. Only after they say yes, run
   `s1 learn --from <staged dir> --install <global|project>`. This re-uses what
   was already crawled — it costs nothing and makes no further requests.
6. Offer to sharpen the generated `SKILL.md` description and triggers. An
   existing directory `s1 learn` did not create is never overwritten.

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
