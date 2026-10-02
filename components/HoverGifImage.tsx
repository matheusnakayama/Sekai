"use client";

import { useState, type SyntheticEvent } from "react";

const posterCache = new Map<string, string>();

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
  const animate = isHovered ?? localHover;

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
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const posterUrl = canvas.toDataURL("image/png");
      posterCache.set(src, posterUrl);
      setPoster(posterUrl);
    } catch {
      // Hosts that deny canvas access still display the original image instead of hiding it.
    }
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      crossOrigin={gif && !corsBlocked ? "anonymous" : undefined}
      src={gif && poster && !animate ? poster : src}
      alt={alt}
      onLoad={capturePoster}
      onError={() => { if (gif && !corsBlocked) setCorsBlocked(true); }}
      onMouseEnter={() => setLocalHover(true)}
      onMouseLeave={() => setLocalHover(false)}
      onFocus={() => setLocalHover(true)}
      onBlur={() => setLocalHover(false)}
      className={className}
    />
  );
}
