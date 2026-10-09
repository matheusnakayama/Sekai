import { lookup } from "dns/promises";
import { NextResponse } from "next/server";
import { isBlockedAddress, isPublicHttpUrl } from "@/lib/linkSafety";

export const runtime = "nodejs";

type Preview = { url: string; title: string; description: string; image: string; site: string };

const cache = new Map<string, { expiresAt: number; preview: Preview | null }>();

function meta(html: string, key: string) {
  const property = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i");
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i");
  const match = html.match(property) || html.match(reversed);
  return match?.[1]?.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").trim() ?? "";
}

function titleOf(html: string) {
  return html.match(/<title[^>]*>([^<]{1,180})<\/title>/i)?.[1]?.trim() ?? "";
}

async function assertPublicHost(hostname: string) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isBlockedAddress(record.address))) {
    throw new Error("Endereço não permitido.");
  }
}

async function readPublicPage(target: string, redirects = 0): Promise<string> {
  if (!isPublicHttpUrl(target) || redirects > 2) throw new Error("Link inválido.");
  const url = new URL(target);
  await assertPublicHost(url.hostname);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(4000),
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "SekaiLinkPreview/1.0" },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirecionamento vazio.");
    return readPublicPage(new URL(location, url).toString(), redirects + 1);
  }
  if (!response.ok) throw new Error("A página não respondeu.");
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html") && !type.includes("application/xhtml")) throw new Error("Não é uma página.");
  const html = await response.text();
  return html.slice(0, 250_000);
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!isPublicHttpUrl(target)) return NextResponse.json({ preview: null }, { status: 400 });
  const cached = cache.get(target);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json({ preview: cached.preview });
  try {
    const html = await readPublicPage(target);
    const title = meta(html, "og:title") || titleOf(html);
    const description = meta(html, "og:description") || meta(html, "description");
    const image = meta(html, "og:image");
    const site = meta(html, "og:site_name") || new URL(target).hostname.replace(/^www\./, "");
    const preview = title ? {
      url: target,
      title: title.slice(0, 140),
      description: description.slice(0, 180),
      image: isPublicHttpUrl(image) ? image : "",
      site: site.slice(0, 60),
    } : null;
    cache.set(target, { preview, expiresAt: Date.now() + 10 * 60 * 1000 });
    return NextResponse.json({ preview });
  } catch {
    cache.set(target, { preview: null, expiresAt: Date.now() + 60 * 1000 });
    return NextResponse.json({ preview: null });
  }
}
