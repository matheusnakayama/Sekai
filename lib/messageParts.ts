import { medalClipId } from "@/lib/medal";
import { isTikTokShortUrl, socialVideoFromUrl } from "@/lib/socialVideoLinks";

export type MessagePart = { type: "text" | "spoiler"; value: string };

const SPOILER = /\|\|([\s\S]+?)\|\|/g;
const URL_PATTERN = /https?:\/\/[^\s<>)\]]+/gi;
const MEDIA_EXTENSION = /\.(gif|png|jpe?g|webp|avif|mp4|webm)(?:$|[?#])/i;

export function splitSpoilers(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let cursor = 0;
  for (const match of content.matchAll(SPOILER)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: "text", value: content.slice(cursor, index) });
    parts.push({ type: "spoiler", value: match[1] });
    cursor = index + match[0].length;
  }
  if (cursor < content.length || parts.length === 0) parts.push({ type: "text", value: content.slice(cursor) });
  return parts.filter((part) => part.value.length > 0);
}

export function extractUrls(content: string) {
  return Array.from(content.matchAll(URL_PATTERN), (match) => match[0].replace(/[.,!?;:]+$/g, ""));
}

export function linkifyUrls(content: string) {
  return content.split(/(```[\s\S]*?```|`[^`]*`)/g).map((chunk, index) => {
    if (index % 2 === 1) return chunk;
    return chunk.replace(/\[([^\]]*)\]\(([^)\s]+)\)|https?:\/\/[^\s<>)\]]+/gi, (match) => {
      if (match.startsWith("[")) return match;
      const url = match.replace(/[.,!?;:]+$/g, "");
      const trail = match.slice(url.length);
      return `[${url}](${url})${trail}`;
    });
  }).join("");
}

export function isDirectMediaUrl(value: string) {
  if (medalClipId(value) || socialVideoFromUrl(value) || isTikTokShortUrl(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && MEDIA_EXTENSION.test(url.pathname + url.search);
  } catch {
    return false;
  }
}

export function isVideoUrl(value: string) {
  return medalClipId(value) !== null
    || socialVideoFromUrl(value) !== null
    || isTikTokShortUrl(value)
    || /\.(mp4|webm)(?:$|[?#])/i.test(value);
}

export function visibleText(content: string, embedMedia: boolean) {
  if (!embedMedia) return content;
  return content.replace(URL_PATTERN, (url) => (isDirectMediaUrl(url) ? "" : url)).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
