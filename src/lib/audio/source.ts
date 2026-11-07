// Resolves a dialog's audio_url to the real audio file and downloads it (server-side only).
// The organizer audio_url returns an HTML player page whose <source> holds a short-lived signed mp3 link;
// direct audio links are used as-is. Resolved links are cached for a while.
const cache = new Map<string, { url: string; expires: number }>();
const TTL_MS = 40 * 60 * 1000;

function decodeHtml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export async function resolveMediaUrl(key: string, audioUrl: string, force = false): Promise<string> {
  const hit = cache.get(key);
  if (!force && hit && hit.expires > Date.now()) return hit.url;
  const res = await fetch(audioUrl, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Recording source responded with HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  let url = audioUrl;
  if (type.includes("text/html")) {
    const html = await res.text();
    const m = /<source[^>]+src="([^"]+)"/i.exec(html) ?? /<audio[^>]+src="([^"]+)"/i.exec(html);
    if (!m) throw new Error("No audio source found in the recording page");
    url = decodeHtml(m[1]);
  } else {
    await res.body?.cancel();
  }
  cache.set(key, { url, expires: Date.now() + TTL_MS });
  return url;
}

export async function fetchMedia(url: string, range: string | null = null) {
  return fetch(url, { headers: range ? { range } : {}, cache: "no-store" });
}

/** Downloads the whole recording. Retries once with a freshly resolved link if the signed one expired. */
export async function downloadAudio(key: string, audioUrl: string, maxBytes = 25 * 1024 * 1024): Promise<{ bytes: Uint8Array; mimeType: string }> {
  let res = await fetchMedia(await resolveMediaUrl(key, audioUrl));
  if (res.status === 403 || res.status === 404) {
    await res.body?.cancel();
    res = await fetchMedia(await resolveMediaUrl(key, audioUrl, true));
  }
  if (!res.ok) throw new Error(`Recording source responded with HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error(`Recording is too large (${buf.byteLength} bytes)`);
  const ct = res.headers.get("content-type") ?? "";
  return { bytes: buf, mimeType: ct.startsWith("audio/") ? ct.split(";")[0] : "audio/mpeg" };
}
