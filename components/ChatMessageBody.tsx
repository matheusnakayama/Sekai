"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatDisplayPreferences } from "@/lib/chatPreferences";
import { extractUrls, isDirectMediaUrl, isVideoUrl, splitSpoilers, visibleText } from "@/lib/messageParts";

type Preview = { url: string; title: string; description: string; image: string; site: string };
const previewCache = new Map<string, Preview | null>();

function MarkdownText({ content, emojis, inline }: { content: string; emojis: Map<string, string>; inline: boolean }) {
  const withEmoji = content.replace(/:([a-z0-9_-]{1,32}):/gi, (token, name: string) => {
    const url = emojis.get(name.toLowerCase());
    return url ? `![${name}](<${url}>)` : token;
  });
  if (!withEmoji.trim()) return null;
  const Tag = inline ? "span" : "div";
  return (
    <Tag className="prose prose-invert max-w-none text-[15px] leading-6 text-discord-text-normal prose-p:my-0 prose-code:text-discord-text-normal sm:text-sm">
      <ReactMarkdown components={{
        p: ({ children }) => inline ? <span>{children}</span> : <p className="my-0">{children}</p>,
        img: ({ src, alt }) => <img src={src ?? ""} alt={alt ?? "emoji"} loading="lazy" className="mx-0.5 inline-block h-6 w-6 align-[-0.25em] object-contain" />,
      }}>
        {withEmoji}
      </ReactMarkdown>
    </Tag>
  );
}

function SpoilerText({ value, always }: { value: string; always: boolean }) {
  const [open, setOpen] = useState(always);
  if (open) return <span className="rounded bg-white/10 px-1">{value}</span>;
  return (
    <button type="button" onClick={() => setOpen(true)} className="rounded bg-white/25 px-1 text-transparent transition hover:bg-white/40" aria-label="Mostrar spoiler">
      {value}
    </button>
  );
}

export function ChatMessageBody({
  content,
  preferences,
  emojiImages = new Map(),
  previewLinks = true,
}: {
  content: string;
  preferences: Pick<ChatDisplayPreferences, "embedLinkMedia" | "showLinkPreviews" | "spoilerDisplay">;
  emojiImages?: Map<string, string>;
  previewLinks?: boolean;
}) {
  const parts = splitSpoilers(content);
  const inline = parts.some((part) => part.type === "spoiler");
  const urls = extractUrls(parts.filter((part) => part.type === "text").map((part) => part.value).join(" "));
  const media = preferences.embedLinkMedia ? urls.filter(isDirectMediaUrl) : [];
  const previewUrl = previewLinks && preferences.showLinkPreviews ? urls.find((url) => !isDirectMediaUrl(url)) : undefined;
  const [preview, setPreview] = useState<Preview | null>(previewUrl ? previewCache.get(previewUrl) ?? null : null);

  useEffect(() => {
    if (!previewUrl) { setPreview(null); return; }
    const cached = previewCache.get(previewUrl);
    if (cached !== undefined) { setPreview(cached); return; }
    let cancelled = false;
    void fetch(`/api/link-preview?url=${encodeURIComponent(previewUrl)}`)
      .then((response) => response.json())
      .then((payload: { preview?: Preview | null }) => {
        const next = payload.preview ?? null;
        previewCache.set(previewUrl, next);
        if (!cancelled) setPreview(next);
      })
      .catch(() => { previewCache.set(previewUrl, null); });
    return () => { cancelled = true; };
  }, [previewUrl]);

  return (
    <div className="min-w-0">
      {parts.map((part, index) => part.type === "spoiler"
        ? <SpoilerText key={index} value={part.value} always={preferences.spoilerDisplay === "always"} />
        : <MarkdownText key={index} content={visibleText(part.value, preferences.embedLinkMedia)} emojis={emojiImages} inline={inline} />)}
      {media.map((url) => isVideoUrl(url)
        ? <video key={url} src={url} controls className="mt-2 max-h-80 max-w-full rounded-lg" />
        : <img key={url} src={url} alt="" loading="lazy" className="mt-2 max-h-80 max-w-full rounded-lg object-contain" />)}
      {preview && (
        <a href={preview.url} target="_blank" rel="noreferrer" className="mt-2 flex max-w-md overflow-hidden rounded-xl border border-white/10 bg-black/20 no-underline">
          {preview.image && <img src={preview.image} alt="" className="h-20 w-20 shrink-0 object-cover" />}
          <span className="min-w-0 px-3 py-2">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-discord-text-muted">{preview.site}</span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-discord-header-primary">{preview.title}</span>
            {preview.description && <span className="mt-0.5 block line-clamp-2 text-xs text-discord-text-muted">{preview.description}</span>}
          </span>
        </a>
      )}
    </div>
  );
}
