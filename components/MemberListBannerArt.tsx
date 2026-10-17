"use client";

import { CroppedProfileImage } from "@/components/ProfileBanner";
import { MEMBER_LIST_BANNER_MASK, MEMBER_LIST_BANNER_OPACITY } from "@/lib/memberListBanner";
import { cn } from "@/lib/utils";

export function MemberListBannerArt({
  src,
  positionX,
  positionY,
  zoom,
  hovered = false,
  playing = false,
}: {
  src: string;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
  hovered?: boolean;
  playing?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ opacity: MEMBER_LIST_BANNER_OPACITY, maskImage: MEMBER_LIST_BANNER_MASK, WebkitMaskImage: MEMBER_LIST_BANNER_MASK }}
    >
      <CroppedProfileImage
        src={src}
        positionX={positionX}
        positionY={positionY}
        zoom={zoom}
        pauseGif={!playing}
        isHovered={hovered || playing}
        className={cn("transition duration-200", (hovered || playing) && "brightness-110")}
      />
      <span className="absolute inset-0 bg-gradient-to-l from-black/35 via-black/10 to-transparent" />
    </div>
  );
}
