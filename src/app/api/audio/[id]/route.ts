import { prisma } from "@/lib/db";
import type { Params } from "@/lib/api";

import { fetchMedia, resolveMediaUrl } from "@/lib/audio/source";

// Streams the recording with Range support (avoids CORS, lets the browser decode the waveform).
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
