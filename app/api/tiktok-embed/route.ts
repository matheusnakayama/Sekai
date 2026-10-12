import { NextResponse } from "next/server";
import { z } from "zod";
import { readBoundedStream } from "@/lib/http/requestBody";
import { isTikTokShortUrl } from "@/lib/socialVideoLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, { id: string | null; expiresAt: number }>();

export async function GET(request: Request) {
  const parsed = z.string().trim().min(1).max(2048).url().safeParse(new URL(request.url).searchParams.get("url") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "Link do TikTok inválido." }, { status: 400 });
  const url = parsed.data;
  if (!isTikTokShortUrl(url)) return NextResponse.json({ error: "Link do TikTok inválido." }, { status: 400 });

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.id ? NextResponse.json({ id: cached.id }) : NextResponse.json({ error: "Vídeo indisponível." }, { status: 404 });
  }

  try {
    const endpoint = new URL("https://www.tiktok.com/oembed");
    endpoint.searchParams.set("url", url);
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("TikTok não retornou o vídeo.");
    const responseText = await readBoundedStream(response.body, 128_000);
    if (!responseText) throw new Error("Resposta do TikTok inválida.");
    const payload = z.object({ html: z.string().max(120_000).optional() }).passthrough().safeParse(JSON.parse(responseText));
    const html = payload.success ? payload.data.html ?? "" : "";
    const id = html.match(/data-video-id=["'](\d{8,30})["']/i)?.[1] ?? null;
    cache.set(url, { id, expiresAt: Date.now() + (id ? 60 * 60_000 : 60_000) });
    return id
      ? NextResponse.json({ id }, { headers: { "Cache-Control": "public, max-age=3600" } })
      : NextResponse.json({ error: "Vídeo indisponível." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Não foi possível resolver o link do TikTok." }, { status: 502 });
  }
}
