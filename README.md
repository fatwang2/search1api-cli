# search1api-cli

Command-line interface for [Search1API](https://search1api.com) — web search, news, crawl, sitemap, reasoning, and trending from your terminal.

## Installation

```bash
npm install -g search1api-cli
```

This installs two commands: `search1api` and `s1` (shorthand).

## Setup

Set your API key (get one at [search1api.com](https://search1api.com)):

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

### reasoning

Deep thinking and reasoning powered by DeepSeek R1.

```bash
s1 reasoning "Explain the fundamentals of quantum computing"
s1 reason "Compare REST vs GraphQL"    # 'reason' is a shorthand alias
```

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

### config

Manage CLI configuration.

```bash
s1 config set-key <key>   # Save API key
s1 config show             # Show current config
```

## JSON Output

All commands support `--json` flag to output raw JSON, useful for piping and scripting:

```bash
s1 search "test" --json | jq '.results[0].title'
s1 balance --json
```

## License

MIT
