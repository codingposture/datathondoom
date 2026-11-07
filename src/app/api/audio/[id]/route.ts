import { prisma } from "@/lib/db";
import type { Params } from "@/lib/api";

// The organizer audio_url returns an HTML player page whose <source> holds a short-lived signed mp3 link.
// We resolve that link on the server (cached for a while) and stream the audio with Range support,
// which avoids CORS and lets the browser decode the waveform.
const cache = new Map<string, { url: string; expires: number }>();
const TTL_MS = 40 * 60 * 1000;

function decodeHtml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function resolveMediaUrl(id: string, audioUrl: string, force = false): Promise<string> {
  const hit = cache.get(id);
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
  cache.set(id, { url, expires: Date.now() + TTL_MS });
  return url;
}

async function fetchMedia(url: string, range: string | null) {
  return fetch(url, { headers: range ? { range } : {}, cache: "no-store" });
}

export async function GET(req: Request, { params }: Params<"id">) {
  const { id } = await params;
  const c = await prisma.conversation.findUnique({ where: { id }, select: { audioUrl: true } });
  if (!c?.audioUrl) return Response.json({ error: "No recording for this conversation" }, { status: 404 });
  const range = req.headers.get("range");

  let upstream: Response;
  try {
    upstream = await fetchMedia(await resolveMediaUrl(id, c.audioUrl), range);
    if (upstream.status === 403 || upstream.status === 404) {
      // Signed link expired: resolve again once.
      await upstream.body?.cancel();
      upstream = await fetchMedia(await resolveMediaUrl(id, c.audioUrl, true), range);
    }
  } catch (e) {
    return Response.json({ error: `Recording is unavailable: ${(e as Error).message}` }, { status: 502 });
  }
  if (!upstream.ok) {
    return Response.json({ error: `Recording source responded with HTTP ${upstream.status}` }, { status: 502 });
  }
  const out = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  const ct = out.get("content-type") ?? "";
  if (!ct.startsWith("audio/")) out.set("content-type", "audio/mpeg");
  out.set("cache-control", "private, max-age=600");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
