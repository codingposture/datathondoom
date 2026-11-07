// Browser-side fetch helper. API base is configurable so the UI can be hosted separately (e.g. in Dynamics 365).
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const issues = data?.issues as { path: (string | number)[]; message: string }[] | undefined;
    const detail = issues?.length ? `: ${issues.map((i) => `${i.path.join(".")} — ${i.message}`).join("; ")}` : "";
    throw new Error(`${data?.error ?? `HTTP ${res.status}`}${detail}`);
  }
  return data as T;
}
