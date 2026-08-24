# search1api-cli

Command-line interface for [Search1API](https://s1.dev) — web search, news, crawl, sitemap, trending, and turning a URL into an Agent Skill, from your terminal.

## Installation

### Quick install (no Node.js required)

```bash
curl -fsSL https://cli.search1api.com/install.sh | bash
```

This downloads a standalone binary and installs it as `s1`.

### Via npm

```bash
npm install -g search1api-cli
```

This installs two commands: `search1api` and `s1` (shorthand).

## Updating

```bash
s1 update
```

`s1 update` updates you in place using whichever method you installed with:

- **Binary install** — downloads the latest release for your platform and replaces the running binary (uses `sudo` automatically if needed).
- **npm install** — prints the `npm install -g search1api-cli` command to run.

`s1` also checks for new versions in the background and shows a notice when one is available.

## Setup

Authorize the CLI with OAuth 2.1 in your browser. The CLI dynamically registers
as a public client, uses Authorization Code with PKCE, and refreshes access
tokens automatically:

```bash
s1 login
```

Manual fallback:

```bash
s1 config set-key <your-api-key>
```

Or use an environment variable:

```bash
export SEARCH1API_KEY=<your-api-key>
```

## Commands

### search

Search the web across 13 search engines.

```bash
s1 search "Claude AI"
s1 search "rust async" -n 5 -s google
s1 search "machine learning" --include arxiv.org github.com
s1 search "breaking news" -t day
s1 search "web framework" -c 3    # crawl top 3 results for full content
```

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --max-results <number>` | Number of results (1-50) | 10 |
| `-s, --service <service>` | Search engine | google |
| `-c, --crawl <number>` | Crawl N results for full content | 0 |
| `--include <sites...>` | Only include these sites | |
| `--exclude <sites...>` | Exclude these sites | |
| `-t, --time <range>` | Time range: `day`, `month`, `year` | |
| `--json` | Output raw JSON | |

Available search services: `google`, `bing`, `duckduckgo`, `yahoo`, `x`, `reddit`, `github`, `youtube`, `arxiv`, `wechat`, `bilibili`, `imdb`, `wikipedia`

### news

Search for news articles.

```bash
s1 news "AI regulation"
s1 news "tech layoffs" -s hackernews -t day
```

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --max-results <number>` | Number of results (1-50) | 10 |
| `-s, --service <service>` | News service | bing |
| `-c, --crawl <number>` | Crawl N results for full content | 0 |
| `--include <sites...>` | Only include these sites | |
| `--exclude <sites...>` | Exclude these sites | |
| `-t, --time <range>` | Time range: `day`, `month`, `year` | |
| `--json` | Output raw JSON | |

Available news services: `google`, `bing`, `duckduckgo`, `yahoo`, `hackernews`

### crawl

Extract content from a URL.

```bash
s1 crawl https://example.com/article
```

### sitemap

Get related links from a website.

```bash
s1 sitemap https://example.com
```

### learn

Turn a URL into an installable Agent Skill directory.

```bash
s1 learn https://example.com/guide              # one page, 1 credit
s1 learn https://example.com/docs --site        # the site, ~1 credit per page
s1 learn https://example.com/docs --site --max-pages 40
s1 learn https://example.com/docs --site --depth 2   # follow links the sitemap missed
s1 learn --from <staged dir> --install project  # install what was already learned
```

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
| `--depth <N>` | In `--site` mode, also follow links found in the pages learned | 1 |
| `--name <name>` | Skill directory name | derived from the host |
| `--out <dir>` | Where to write the directory | staging dir under the cache |
| `--from <dir>` | Install an already-learned directory instead of crawling | |
| `--install <scope>` | `global` (`~/.agents/skills/`) or `project` (`./.agents/skills/`) | not installed |
| `--json` | Output raw JSON | |

Nothing is installed unless `--install` is passed, and a directory `s1 learn`
did not create is never overwritten. Relearning the same URL rewrites
`references/` and keeps a `SKILL.md` you have edited.

Page content is written straight to disk. The command prints a summary, and
`--json` lists only `file`, `url`, and `title` per page — so learning a large
site does not push its text through the agent that ran it.

### trending

Get trending topics from popular platforms.

```bash
s1 trending github
s1 trending hackernews -n 20
```

Available services: `github`, `hackernews`

### balance

Check your remaining API credits.

```bash
s1 balance
```

### login

Authorize in your browser with OAuth 2.1 and PKCE.

```bash
s1 login
s1 login --no-browser
```

### config

Manage CLI configuration.

```bash
s1 config set-key <key>   # Save API key manually
s1 config show            # Show current config
s1 config clear           # Remove saved OAuth tokens and API keys
```

### update

Update `s1` to the latest version. See [Updating](#updating).

```bash
s1 update
s1 update --force   # reinstall even if already on the latest version
```

## SDK

Plugin and integration packages can reuse the CLI's authentication, OAuth
refresh, request handling, and typed Search1API methods instead of maintaining
a second client:

```ts
import { search, crawl } from "search1api-cli/sdk";

const results = await search("OpenCode plugins", {
  maxResults: 5,
  searchService: "github",
});

const page = await crawl("https://example.com");
```

The SDK uses `SEARCH1API_KEY`, the shared `s1 login` OAuth session, or the
optional per-call `apiKey`. Every method also accepts an `AbortSignal` so host
applications can cancel tool calls.

## Agent skill and plugins

This repo is the shared distribution point for the Search1API Agent Skill and
compatibility manifests for Claude Code, ChatGPT/Codex, and Cursor. Dedicated
OpenCode, OpenClaw, and Grok Build plugins reuse the same Search1API SDK,
hosted MCP server, and research workflow from their own repositories.

### Agent Skill

Install the standalone skill:

```bash
npx skills add superagents-lab/search1api-cli
```

### Claude Code

Install the Claude Code plugin from Search1API's custom marketplace:

```bash
claude plugin marketplace add superagents-lab/search1api-cli
claude plugin install search1api@superagents-lab
```

### Codex

Add this repository as a Codex marketplace, then install the plugin:

```bash
codex plugin marketplace add superagents-lab/search1api-cli
codex plugin add search1api@superagents-lab
```

### Grok Build

Install the dedicated
[`grok-search1api`](https://github.com/superagents-lab/grok-search1api)
plugin directly from GitHub:

```bash
agent plugin install superagents-lab/grok-search1api --trust
```

The same repository can also be added as a custom Grok marketplace:

```bash
agent plugin marketplace add superagents-lab/grok-search1api
```

### OpenCode and OpenClaw

Install the dedicated OpenCode plugin from npm:

```bash
opencode plugin opencode-search1api
```

Install the dedicated OpenClaw plugin from ClawHub:

```bash
openclaw plugins install clawhub:@fatwang2/openclaw-search1api
```

See the source repositories for platform-specific configuration and release
details:

- [`opencode-search1api`](https://github.com/superagents-lab/opencode-search1api)
- [`openclaw-search1api`](https://github.com/superagents-lab/openclaw-search1api)
- [`grok-search1api`](https://github.com/superagents-lab/grok-search1api)

### Development and directories

Developers can validate or test the plugin bundle from a local clone:

```bash
claude plugin validate . --strict
claude --plugin-dir .
```

The remote server is also published as
[`io.github.superagents-lab/search1api`](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.superagents-lab%2Fsearch1api)
in the official MCP Registry. Directory reviewers can use the
[submission kit](docs/directory-submission.md) for verified URLs, listing copy,
authentication details, use cases, and test cases. The Cursor manifest in this
repository is available for local or team testing; public Cursor Marketplace
availability is a separate review process.

Once installed, you can ask the host agent things like:
- "search for the latest AI news"
- "what does this link say? https://example.com"
- "what's trending on GitHub?"
- "research quantum computing thoroughly"
- "learn these docs so you can use them later"

The plugin uses the hosted Search1API MCP tools and the shared research skill;
the `s1` CLI remains available as a fallback where supported.

## JSON Output

All commands support `--json` flag to output raw JSON, useful for piping and scripting:

```bash
s1 search "test" --json | jq '.results[0].title'
s1 balance --json
```

## License

MIT
