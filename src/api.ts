import { fetchWithAuth } from "./auth.js";
import { API_BASE } from "./config.js";

export async function request<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const res = await fetchWithAuth(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}
