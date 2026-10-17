"use client";

import { CroppedProfileImage } from "@/components/ProfileBanner";
import { MEMBER_LIST_BANNER_MASK } from "@/lib/memberListBanner";
import { cn } from "@/lib/utils";

export function MemberListBannerArt({
  src,
  positionX,
  positionY,
  zoom,
  width,
  hovered = false,
  playing = false,
}: {
  src: string;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
  width: number | string;
  hovered?: boolean;
  playing?: boolean;
}) {
  if (typeof width === "number" && width < 28) return null;
  const size = typeof width === "number" ? `${width}px` : width;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 right-0 top-0 z-0 overflow-hidden"
      style={{ width: size, maskImage: MEMBER_LIST_BANNER_MASK, WebkitMaskImage: MEMBER_LIST_BANNER_MASK }}
    >
      <CroppedProfileImage
        src={src}
        positionX={positionX}
        positionY={positionY}
        zoom={zoom}
        pauseGif={!playing}
        isHovered={hovered || playing}
        className={cn("opacity-95 transition duration-200", (hovered || playing) && "brightness-110")}
      />
    </div>
  );
}
