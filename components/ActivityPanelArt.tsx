"use client";

import { CroppedProfileImage } from "@/components/ProfileBanner";
import { ACTIVITY_PANEL_HEIGHT, ACTIVITY_PANEL_MASK } from "@/lib/activityBanner";
import { cn } from "@/lib/utils";

export function ActivityPanelArt({
  src,
  positionX,
  positionY,
  zoom,
  className,
}: {
  src: string;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-x-0 top-0 overflow-hidden", className)}
      style={{ height: ACTIVITY_PANEL_HEIGHT, maskImage: ACTIVITY_PANEL_MASK, WebkitMaskImage: ACTIVITY_PANEL_MASK }}
    >
      <CroppedProfileImage
        src={src}
        positionX={positionX}
        positionY={positionY}
        zoom={zoom}
        pauseGif={false}
        className="opacity-[.55] saturate-[.9]"
      />
    </div>
  );
}
