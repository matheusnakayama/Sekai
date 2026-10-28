"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { MEMBER_LIST_BANNER_GAP, MEMBER_LIST_BANNER_OPACITY, memberListBannerMask } from "@/lib/memberListBanner";
import { cn } from "@/lib/utils";

export function useMemberListBannerFade(rowRef: RefObject<HTMLElement | null>, nameRef: RefObject<HTMLElement | null>, enabled: boolean, label = "") {
  const [measure, setMeasure] = useState({ nameEnd: 72, rowWidth: 240, rowHeight: 46 });

  useLayoutEffect(() => {
    const row = rowRef.current;
    const name = nameRef.current;
    if (!row || !name || !enabled) return;
    const update = () => {
      const rowBounds = row.getBoundingClientRect();
      const nameBounds = name.getBoundingClientRect();
      const visibleNameWidth = Math.min(name.scrollWidth, name.clientWidth);
      const end = nameBounds.left - rowBounds.left + visibleNameWidth + MEMBER_LIST_BANNER_GAP;
      setMeasure({ nameEnd: Math.max(0, Math.min(rowBounds.width, end)), rowWidth: rowBounds.width, rowHeight: rowBounds.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(row);
    observer.observe(name);
    return () => observer.disconnect();
  }, [enabled, label, nameRef, rowRef]);

  return measure;
}

export function MemberListBannerArt({
  src,
  positionX,
  positionY,
  zoom,
  nameEnd,
  rowWidth,
  rowHeight,
  hovered = false,
  playing = false,
}: {
  src: string;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
  nameEnd: number;
  rowWidth: number;
  rowHeight: number;
  hovered?: boolean;
  playing?: boolean;
}) {
  const mask = memberListBannerMask(nameEnd, rowWidth, rowHeight);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ opacity: MEMBER_LIST_BANNER_OPACITY, maskImage: mask, WebkitMaskImage: mask, maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" }}
    >
      <CroppedProfileImage
        src={src}
        positionX={positionX}
        positionY={positionY}
        zoom={zoom}
        pauseGif={!playing}
        isHovered={hovered || playing}
        className={cn("transition duration-200", (hovered || playing) && "brightness-105")}
      />
    </div>
  );
}

export function MemberListBannerPreview({
  src,
  name,
  positionX,
  positionY,
  zoom,
  playing = false,
}: {
  src?: string | null;
  name: string;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
  playing?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const fade = useMemberListBannerFade(rowRef, nameRef, Boolean(src), name);
  return (
    <div ref={rowRef} className="relative mb-3 flex h-12 w-60 items-center gap-2 overflow-hidden rounded-lg bg-[#1a1b1e] px-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.04)]">
      {src && <MemberListBannerArt src={src} positionX={positionX} positionY={positionY} zoom={zoom} nameEnd={fade.nameEnd} rowWidth={fade.rowWidth} rowHeight={fade.rowHeight} playing={playing} />}
      <span className="relative z-10 h-8 w-8 shrink-0 rounded-full bg-discord-brand shadow-[0_0_0_2px_rgba(0,0,0,.45)]" />
      <span ref={nameRef} className="relative z-10 min-w-0 truncate text-[13px] font-semibold text-white">{name || "Seu nome"}</span>
    </div>
  );
}

export function MemberRowMeta({ banner, children }: { banner: boolean; children: ReactNode }) {
  return <span className={cn("min-w-0", banner && "[text-shadow:0_1px_2px_rgba(0,0,0,.72)]")}>{children}</span>;
}
