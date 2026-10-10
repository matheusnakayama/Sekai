"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatDisplayPreferences } from "@/lib/chatPreferences";
import { medalClipId, medalSocialVideoUrl } from "@/lib/medal";
import { extractUrls, isDirectMediaUrl, isVideoUrl, linkifyUrls, splitSpoilers, visibleText } from "@/lib/messageParts";
import { isTikTokShortUrl, socialVideoFromUrl } from "@/lib/socialVideoLinks";
import { inviteCodeFromUrl } from "@/lib/invites";
import { linkifyMentions, type MentionName } from "@/lib/mentions";
import { ServerInviteEmbed } from "@/components/ServerInviteCard";

type Preview = { url: string; title: string; description: string; image: string; site: string };
const previewCache = new Map<string, Preview | null>();

function MarkdownText({ content, emojis, inline }: { content: string; emojis: Map<string, string>; inline: boolean }) {
  const withEmoji = linkifyUrls(content).replace(/:([a-z0-9_-]{1,32}):/gi, (token, name: string) => {
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
        a: ({ href, children }) => {
          if (href === "#sekai-mention" || href === "#sekai-mention-mine") {
            return <span className={href === "#sekai-mention-mine" ? "mention-chip mention-chip-mine" : "mention-chip"}>{children}</span>;
          }
          return <a href={href} target="_blank" rel="noreferrer" className="sekai-link">{children}</a>;
        },
      }}>
        {withEmoji}
      </ReactMarkdown>
    </Tag>
  );
}

function MediaEmbed({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  const [resolvedTikTokId, setResolvedTikTokId] = useState<string | null>(null);
  const clipId = medalClipId(url);
  const src = clipId ? medalSocialVideoUrl(clipId) : url;
  const socialVideo = socialVideoFromUrl(url);
  const shortTikTokUrl = isTikTokShortUrl(url);

  useEffect(() => {
    if (!shortTikTokUrl) return;
    let cancelled = false;
    void fetch(`/api/tiktok-embed?url=${encodeURIComponent(url)}`)
      .then((response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o vídeo.");
        return response.json() as Promise<{ id?: string }>;
      })
      .then(({ id }) => {
        if (!cancelled && id && /^\d{8,30}$/.test(id)) setResolvedTikTokId(id);
        else if (!cancelled) setBroken(true);
      })
      .catch(() => { if (!cancelled) setBroken(true); });
    return () => { cancelled = true; };
  }, [shortTikTokUrl, url]);

  if (broken) {
    return <a href={url} target="_blank" rel="noreferrer" className="sekai-link mt-2 block break-all text-sm">{url}</a>;
  }
  if (shortTikTokUrl || socialVideo) {
    const provider = socialVideo?.provider ?? "tiktok";
    const id = socialVideo?.id ?? resolvedTikTokId;
    if (!id) {
      return <div className="mt-2 flex w-full max-w-sm items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-discord-text-muted">
        <span>Carregando vídeo do TikTok…</span>
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-discord-brand hover:underline">Abrir no TikTok</a>
      </div>;
    }
    const playerUrl = provider === "tiktok"
      ? `https://www.tiktok.com/player/v1/${encodeURIComponent(id)}?controls=1&description=1`
      : `https://www.instagram.com/reel/${encodeURIComponent(id)}/embed/`;
    return <div className="mt-2 w-full">
      <div className={`overflow-hidden rounded-xl bg-black ${provider === "tiktok" ? "aspect-[9/16] w-full max-w-[360px] max-h-[min(640px,70dvh)]" : "h-[min(700px,75dvh)] w-full max-w-[420px]"}`}>
        <iframe
          src={playerUrl}
          title={provider === "tiktok" ? "Vídeo do TikTok" : "Reel do Instagram"}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
        />
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-discord-brand hover:underline">Abrir no {provider === "tiktok" ? "TikTok" : "Instagram"}</a>
    </div>;
  }
  if (isVideoUrl(url)) {
    return (
      <video
        ref={(node) => { node?.setAttribute("referrerpolicy", "no-referrer"); }}
        src={src}
        controls
        playsInline
        preload="metadata"
        onContextMenu={(event) => event.preventDefault()}
        onError={() => setBroken(true)}
        aria-label={clipId ? "Clipe do Medal" : "Vídeo"}
        className="mt-2 aspect-video w-full max-w-xl rounded-xl bg-black"
      />
    );
  }
  return <img src={url} alt="" loading="lazy" className="mt-2 max-h-80 max-w-full rounded-lg object-contain" />;
}

function SpoilerText({ value, always, emojis }: { value: string; always: boolean; emojis: Map<string, string> }) {
  const [open, setOpen] = useState(always);
  if (open) return <MarkdownText content={value} emojis={emojis} inline />;
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
  mentionNames = [],
}: {
  content: string;
  preferences: Pick<ChatDisplayPreferences, "embedLinkMedia" | "showLinkPreviews" | "spoilerDisplay">;
  emojiImages?: Map<string, string>;
  previewLinks?: boolean;
  mentionNames?: MentionName[];
}) {
  const parts = splitSpoilers(content);
  const inline = parts.some((part) => part.type === "spoiler");
  const urls = extractUrls(parts.filter((part) => part.type === "text").map((part) => part.value).join(" "));
  const media = preferences.embedLinkMedia ? urls.filter(isDirectMediaUrl) : [];
  const inviteCode = urls.map((url) => inviteCodeFromUrl(url)).find((code): code is string => Boolean(code)) ?? null;
  const previewUrl = previewLinks && preferences.showLinkPreviews && !inviteCode ? urls.find((url) => !isDirectMediaUrl(url)) : undefined;
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
        ? <SpoilerText key={index} value={linkifyMentions(part.value, mentionNames)} always={preferences.spoilerDisplay === "always"} emojis={emojiImages} />
        : <MarkdownText key={index} content={linkifyMentions(visibleText(part.value, preferences.embedLinkMedia), mentionNames)} emojis={emojiImages} inline={inline} />)}
      {media.map((url) => <MediaEmbed key={url} url={url} />)}
      {inviteCode && <ServerInviteEmbed code={inviteCode} />}
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
