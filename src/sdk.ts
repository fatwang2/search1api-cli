import { request } from "./api.js";

export type TimeRange = "day" | "month" | "year";

export type SearchService =
  | "google"
  | "bing"
  | "duckduckgo"
  | "yahoo"
  | "x"
  | "reddit"
  | "github"
  | "youtube"
  | "arxiv"
  | "wechat"
  | "bilibili"
  | "imdb"
  | "wikipedia";

export type NewsService =
  | "google"
  | "bing"
  | "duckduckgo"
  | "yahoo"
  | "hackernews";

export type TrendingService = "github" | "hackernews";

export interface RequestOptions {
  apiKey?: string;
  signal?: AbortSignal;
}

export interface SearchOptions extends RequestOptions {
  maxResults?: number;
  searchService?: SearchService;
  crawlResults?: number;
  includeSites?: string[];
  excludeSites?: string[];
  timeRange?: TimeRange;
}

export interface NewsOptions extends RequestOptions {
  maxResults?: number;
  searchService?: NewsService;
  crawlResults?: number;
  includeSites?: string[];
  excludeSites?: string[];
  timeRange?: TimeRange;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  content?: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface CrawlResult {
  title: string;
  link: string;
  content: string;
}

export interface CrawlResponse {
  results: CrawlResult;
}

export interface SitemapResponse {
  links: string[];
}

export interface TrendingResult {
  title: string;
  url: string;
  description?: string;
}

export interface TrendingResponse {
  results: TrendingResult[];
}

export interface TrendingOptions extends RequestOptions {
  maxResults?: number;
}

function searchBody(
  query: string,
  options: SearchOptions | NewsOptions,
  defaults: { maxResults: number; searchService: SearchService | NewsService }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    max_results: options.maxResults ?? defaults.maxResults,
    search_service: options.searchService ?? defaults.searchService,
    crawl_results: options.crawlResults ?? 0,
  };
  if (options.includeSites) body.include_sites = options.includeSites;
  if (options.excludeSites) body.exclude_sites = options.excludeSites;
  if (options.timeRange) body.time_range = options.timeRange;
  return body;
}

export async function search(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  return request<SearchResponse>(
    "/search",
    searchBody(query, options, { maxResults: 10, searchService: "google" }),
    options
  );
}

export async function news(
  query: string,
  options: NewsOptions = {}
): Promise<SearchResponse> {
  return request<SearchResponse>(
    "/news",
    searchBody(query, options, { maxResults: 10, searchService: "bing" }),
    options
  );
}

export async function crawl(
  url: string,
  options: RequestOptions = {}
): Promise<CrawlResponse> {
  return request<CrawlResponse>("/crawl", { url }, options);
}

export async function sitemap(
  url: string,
  options: RequestOptions = {}
): Promise<SitemapResponse> {
  return request<SitemapResponse>("/sitemap", { url }, options);
}

export async function trending(
  service: TrendingService,
  options: TrendingOptions = {}
): Promise<TrendingResponse> {
  return request<TrendingResponse>(
    "/trending",
    {
      search_service: service,
      max_results: options.maxResults ?? 10,
    },
    options
  );
}
