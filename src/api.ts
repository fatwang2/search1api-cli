import { fetchWithAuth } from "./auth.js";
import { API_BASE } from "./config.js";

export interface RequestOptions {
  apiKey?: string;
  signal?: AbortSignal;
}

export async function request<T>(
  path: string,
  body: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  };
  const res = options.apiKey
    ? await fetch(url, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init.headers).entries()),
          Authorization: `Bearer ${options.apiKey}`,
        },
      })
    : await fetchWithAuth(url, init);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}
