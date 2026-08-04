import assert from "node:assert/strict";
import test from "node:test";

process.env.SEARCH1API_KEY = "test-key";
process.env.SEARCH1API_API_BASE = "https://api.example.test";

const { crawl, news, search, sitemap, trending } = await import("../dist/sdk.js");

async function captureRequest(run, response) {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (input, init) => {
    captured = { input: String(input), init };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const result = await run();
    return { captured, result };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("search maps SDK options to the Search1API request", async () => {
  const response = { results: [{ title: "A", link: "https://a.test", snippet: "B" }] };
  const { captured, result } = await captureRequest(
    () =>
      search("open source agents", {
        maxResults: 7,
        searchService: "github",
        crawlResults: 2,
        includeSites: ["github.com"],
        excludeSites: ["gist.github.com"],
        timeRange: "month",
      }),
    response
  );

  assert.deepEqual(result, response);
  assert.equal(captured.input, "https://api.example.test/search");
  assert.equal(new Headers(captured.init.headers).get("Authorization"), "Bearer test-key");
  assert.deepEqual(JSON.parse(captured.init.body), {
    query: "open source agents",
    max_results: 7,
    search_service: "github",
    crawl_results: 2,
    include_sites: ["github.com"],
    exclude_sites: ["gist.github.com"],
    time_range: "month",
  });
});

test("SDK helpers use stable endpoints and defaults", async () => {
  const cases = [
    [() => news("agents"), "/news", { query: "agents", max_results: 10, search_service: "bing", crawl_results: 0 }],
    [() => crawl("https://example.com"), "/crawl", { url: "https://example.com" }],
    [() => sitemap("https://example.com"), "/sitemap", { url: "https://example.com" }],
    [() => trending("github", { maxResults: 5 }), "/trending", { search_service: "github", max_results: 5 }],
  ];

  for (const [run, path, body] of cases) {
    const { captured } = await captureRequest(run, {});
    assert.equal(captured.input, `https://api.example.test${path}`);
    assert.deepEqual(JSON.parse(captured.init.body), body);
  }
});

test("an explicit SDK API key overrides shared CLI credentials", async () => {
  const { captured } = await captureRequest(
    () => crawl("https://example.com", { apiKey: "plugin-key" }),
    {}
  );
  assert.equal(
    new Headers(captured.init.headers).get("Authorization"),
    "Bearer plugin-key"
  );
});
