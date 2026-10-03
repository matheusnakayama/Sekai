"use client";

import { useState, type SyntheticEvent } from "react";

const posterCache = new Map<string, string>();
const FALLBACK_GIF_POSTER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' fill='%2340444b'/%3E%3Ccircle cx='64' cy='47' r='23' fill='%237b8089'/%3E%3Cpath d='M18 128c4-31 21-47 46-47s42 16 46 47' fill='%237b8089'/%3E%3C/svg%3E";

function isGifSource(src: string) {
  return /^data:image\/gif/i.test(src) || /\.gif(?:$|[?#])/i.test(src);
}

export function HoverGifImage({
  src,
  alt,
  className,
  isHovered,
}: {
  src: string;
  alt: string;
  className?: string;
  /** When omitted, animation follows hover directly on the image. */
  isHovered?: boolean;
}) {
  const gif = isGifSource(src);
  const [localHover, setLocalHover] = useState(false);
  const [poster, setPoster] = useState(() => posterCache.get(src) ?? "");
  const [corsBlocked, setCorsBlocked] = useState(false);
  // `isHovered` lets a containing member/message row control playback; the image
  // itself can still be hovered independently (for example in the profile card).
  const animate = Boolean(isHovered) || localHover;

  function capturePoster(event: SyntheticEvent<HTMLImageElement>) {
    if (!gif || posterCache.has(src)) {
      if (posterCache.has(src)) setPoster(posterCache.get(src)!);
      return;
    }

    const image = event.currentTarget;
    if (!image.naturalWidth || !image.naturalHeight) return;
    const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    try {
      const context = canvas.getContext("2d");
      if (!context) { setCorsBlocked(true); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const posterUrl = canvas.toDataURL("image/png");
      posterCache.set(src, posterUrl);
      setPoster(posterUrl);
    } catch {
      // Sem acesso ao primeiro quadro, deixa um poster estático até o hover.
      setCorsBlocked(true);
    }
  }

  // Keep the visible element on a static frame while idle. The hidden probe may
  // decode the GIF to cache its first frame, but it is never shown animated.
  const imageSource = gif && !animate ? poster || FALLBACK_GIF_POSTER : src;

  return (
    <>
      {gif && !poster && !corsBlocked && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          aria-hidden="true"
          crossOrigin="anonymous"
          src={src}
          alt=""
          onLoad={capturePoster}
          onError={() => setCorsBlocked(true)}
          className="hidden"
        />
      </>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={imageSource}
        alt={alt}
        onMouseEnter={() => setLocalHover(true)}
        onMouseLeave={() => setLocalHover(false)}
        onFocus={() => setLocalHover(true)}
        onBlur={() => setLocalHover(false)}
        className={className}
      />
    </>
  );
}
