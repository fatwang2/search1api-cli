import { getApiKey, API_BASE } from "./config.js";

export async function request<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = getApiKey();
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}
