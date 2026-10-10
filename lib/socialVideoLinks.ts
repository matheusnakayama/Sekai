export type SocialVideo = { provider: "tiktok" | "instagram"; id: string };

function parseHttpsUrl(value: string) {
  try {
    const url = new URL(value.replace(/[.,!?;:]+$/g, ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function tiktokVideoId(value: string) {
  const url = parseHttpsUrl(value);
  if (!url || !["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/(?:@[^/]+\/video|video)\/(\d{8,30})\/?$/i);
  return match?.[1] ?? null;
}

export function isTikTokShortUrl(value: string) {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  if (["vm.tiktok.com", "vt.tiktok.com"].includes(host)) return /^\/[A-Za-z0-9_-]{5,40}\/?$/.test(url.pathname);
  return ["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host)
    && /^\/t\/[A-Za-z0-9_-]{5,40}\/?$/.test(url.pathname);
}

export function instagramReelId(value: string) {
  const url = parseHttpsUrl(value);
  if (!url || !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/(?:reel|reels|share\/reel)\/([A-Za-z0-9_-]{5,20})\/?$/i);
  return match?.[1] ?? null;
}

export function socialVideoFromUrl(value: string): SocialVideo | null {
  const tiktokId = tiktokVideoId(value);
  if (tiktokId) return { provider: "tiktok", id: tiktokId };
  const reelId = instagramReelId(value);
  return reelId ? { provider: "instagram", id: reelId } : null;
}
