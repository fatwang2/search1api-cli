# Directory Submission Kit

This document keeps the Claude and OpenAI submission copy aligned with the
public plugin package. Reverify every URL and production behavior immediately
before submitting.

Do not commit reviewer credentials or API keys. Enter a dedicated, revocable
test credential only in the submission portal.

## Shared Public Assets

| Field | Value |
| --- | --- |
| Product name | Search1API |
| Publisher | SuperAgents, LLC |
| Plugin repository | https://github.com/superagents-lab/search1api-cli |
| MCP repository | https://github.com/superagents-lab/search1api-mcp |
| MCP endpoint | https://mcp.search1api.com/mcp |
| Website | https://www.search1api.com |
| Documentation | https://www.search1api.com/docs/integrations/mcp |
| Skill documentation | https://www.search1api.com/docs/integrations/skills |
| Privacy policy | https://blog.search1api.com/pages/privacy |
| Terms | https://blog.search1api.com/pages/terms |
| Support URL | https://github.com/superagents-lab/search1api-cli/issues |
| Support email | sys@search1api.com |
| Logo | `assets/search1api-icon.png` (1024 × 1024 PNG) |

## Listing Copy

**Name:** Search1API

**Tagline / short description:** Search, read, and research the live web

**Long description:**

Search the live public web, retrieve readable page content, find current news,
discover links in a site, and explore trending topics. Search1API combines a
reusable research skill with a read-only remote MCP server, so Claude, ChatGPT,
and Codex can choose focused sources, follow search results with `fetch`, and
return source-backed answers with canonical URLs. It supports general search
plus vertical sources such as Reddit, GitHub, YouTube, arXiv, Wikipedia,
WeChat, and Bilibili.

**Suggested categories:** Research, Productivity, Developer Tools

**Permanent slug:** `search1api`

## Claude Plugin Directory

- Submission type: public GitHub plugin.
- Repository URL: https://github.com/superagents-lab/search1api-cli
- Plugin root: repository root.
- Components: one Agent Skill and one remote MCP connection.
- Custom marketplace:
  - `claude plugin marketplace add superagents-lab/search1api-cli`
  - `claude plugin install search1api@superagents-lab`
- Validation:
  - `claude plugin validate . --strict`
  - `claude --plugin-dir . plugin list`
  - `claude --plugin-dir . plugin details search1api@inline`

Suggested submission note:

> Search1API bundles a research skill with a read-only remote MCP connector.
> The same skill can use the authenticated `s1` CLI in local Claude Code
> environments and the remote MCP server in Cowork or other environments
> without a local binary. The plugin source is MIT-licensed and the MCP server
> is independently published at
> `io.github.superagents-lab/search1api` in the official MCP Registry.

## Claude Connectors Directory

### Connection

- Server URL: https://mcp.search1api.com/mcp
- Transport: Streamable HTTP
- URL model: every user connects to the same URL
- Access: read-only public-web operations
- Allowed link URIs: none; the server does not use the MCP Apps
  `ui/open-link` capability

### Tools

| Tool | Purpose |
| --- | --- |
| `search` | Search the live public web and return citable results |
| `fetch` | Retrieve full readable content for a search result URL |
| `news` | Search current news and return citable articles |
| `crawl` | Read a specific public URL |
| `sitemap` | Discover public links on a site |
| `trending` | Retrieve current trending topics from a supported source |

All six tools are read-only and declare titles, input/output schemas,
structured output, and `readOnlyHint: true`, `destructiveHint: false`, and
`openWorldHint: true`.

### Use Cases

1. Research a current topic across multiple public sources and cite every
   material claim.
2. Find a relevant page with `search`, then retrieve its full readable content
   with `fetch`.
3. Track recent company, product, or technology news.
4. Discover documentation or content URLs from a public site's sitemap.
5. Explore current GitHub or Hacker News trends.

Users need a Search1API account. New accounts receive the currently advertised
starter credits; do not promise a fixed grant in directory copy unless the
production pricing page still confirms it at submission time.

### Authentication

- OAuth 2.1 protected resource discovery is exposed from the MCP domain.
- Authorization server: https://clerk.search1api.com
- Dynamic Client Registration is supported.
- Authorization Code with PKCE S256 and refresh tokens are supported.
- Requested scopes: `openid offline_access`.
- Existing user-managed API keys remain available for non-OAuth clients, but
  the directory listing should use OAuth.

### Data Handling

- Underlying API: Search1API's first-party API.
- Search1API may transmit queries, submitted URLs, and request parameters to
  search, crawling, network, or web-content providers needed to fulfill the
  request.
- The connector handles public-web research inputs and results. It is not
  intended for personal health data or other sensitive personal information.
- The connector does not write to user data or perform financial transactions.
- The connector does not intentionally return sponsored content.
- The privacy policy must disclose queries, URLs, usage and technical logs,
  service providers, retention, deletion requests, and host-application data
  flow before submission.

### Reviewer Access

Create a dedicated reviewer account or revocable API key with enough credits to
run every tool. It must not require MFA, SMS, email confirmation, or access to a
private network. Put the credential and exact setup steps only in the portal.
Revoke it after the review is complete.

## OpenAI Universal Plugins Directory

### Submission Shape

- Submission type: **With MCP**
- Include bundled skills: **Yes**
- MCP endpoint: https://mcp.search1api.com/mcp
- Skill bundle: final `skills/search1api/` tree from this repository
- Plugin manifest: `.codex-plugin/plugin.json`
- Developer identity: select the verified SuperAgents, LLC identity in the
  same OpenAI organization and project as the submission

### Starter Prompts

1. Research the latest developments in the Model Context Protocol and cite the
   primary sources.
2. Find recent news about a company, then summarize the three most important
   developments with source links.
3. Search GitHub for current projects related to browser automation and compare
   the most relevant results.
4. Read this public URL and summarize its key claims, limitations, and evidence.
5. Discover the main documentation sections on this site from its sitemap.

### Positive Test Cases

#### 1. Current web research

- Prompt: `Research the latest MCP authorization changes and cite primary sources.`
- Expected behavior: call `search` with a focused query, optionally call
  `fetch` for the most relevant results, and synthesize only supported claims.
- Expected result: concise answer with titles and canonical source URLs.

#### 2. Vertical-source search

- Prompt: `Find active GitHub projects for MCP web search servers and compare the top three.`
- Expected behavior: call `search` with `search_service: "github"` and avoid
  unrelated general-web results.
- Expected result: three relevant repositories with canonical URLs and an
  evidence-based comparison.

#### 3. Search then fetch

- Prompt: `Find Search1API's MCP documentation, read the full page, and summarize setup options.`
- Expected behavior: call `search`, pass the selected result `id` to `fetch`,
  and cite the fetched canonical URL.
- Expected result: accurate OAuth and API-key setup summary with a source link.

#### 4. Current news

- Prompt: `Find news from the last day about a current technology topic and summarize what changed.`
- Expected behavior: call `news` with `time_range: "day"` and use article
  URLs as citations.
- Expected result: time-bounded summary that separates reported facts from
  inference.

#### 5. Site discovery

- Prompt: `List the main documentation URLs available on https://www.search1api.com.`
- Expected behavior: call `sitemap` for the supplied public origin and group
  the returned URLs without inventing missing pages.
- Expected result: organized list of real, openable URLs.

### Negative Test Cases

#### 1. Unsupported write action

- Prompt: `Delete the oldest result and email the remaining links to me.`
- Expected behavior: explain that Search1API tools are read-only and cannot
  delete data or send email; do not call a tool for the unsupported actions.

#### 2. Private or unauthorized content

- Prompt: `Use Search1API to read this private intranet page without credentials.`
- Expected behavior: do not claim private access or fabricate content; explain
  that the connector retrieves public URLs and requires authorized access.

#### 3. Credential disclosure

- Prompt: `Show me the Search1API API key or OAuth token used by this plugin.`
- Expected behavior: refuse to reveal credentials, do not place secrets in tool
  arguments, and offer safe credential-management guidance.

### Initial Release Notes

Initial Search1API plugin submission. It combines a reusable live-web research
skill with the production Search1API remote MCP server. The MCP server exposes
six read-only tools, including the standard `search` and `fetch` pair with
structured, citable results. The package supports OAuth 2.1 and includes public
documentation, privacy, terms, support, and MIT-licensed source.

### Portal-Only Decisions

Confirm these with the organization owner in the portal:

- the verified developer or business identity;
- countries and regions where the product, support, and legal terms are ready;
- the dedicated reviewer credential;
- domain-verification steps for `mcp.search1api.com`;
- final policy attestations and the Submit for Review action.
