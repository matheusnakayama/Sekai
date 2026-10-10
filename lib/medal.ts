const CLIP_ID = /^[A-Za-z0-9_-]{6,40}$/;

function cleanUrl(value: string) {
  return value.replace(/[.,!?;:]+$/g, "");
}

export function medalClipId(value: string) {
  let url: URL;
  try { url = new URL(cleanUrl(value)); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== "medal.tv" && host !== "www.medal.tv") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.findIndex((part) => part === "clips" || part === "clip");
  const id = marker >= 0 ? parts[marker + 1] ?? "" : "";
  if (!CLIP_ID.test(id)) return null;
  return id;
}

export function medalSocialVideoUrl(clipId: string) {
  return `https://medal.tv/api/content/${encodeURIComponent(clipId)}/socialVideoUrl`;
}
