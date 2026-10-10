"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { badgeHoverLabel, type CustomBadge } from "@/lib/badges";

export function CustomBadgeList({ badges, limit = 4, size = "small" }: {
  badges?: CustomBadge[] | null;
  limit?: number;
  size?: "small" | "medium";
}) {
  if (!badges?.length) return null;
  const visibleBadges = badges.slice(0, limit);
  const sizeClass = size === "medium" ? "h-5 min-w-5 text-[17px]" : "h-4 min-w-4 text-[14px]";
  const imageSizeClass = size === "medium" ? "h-5 w-5" : "h-4 w-4";

  return (
    <span className="inline-flex min-w-0 items-center gap-1 align-middle" aria-label={`${badges.length} insígnias`}>
      {visibleBadges.map((badge) => (
        <BadgeMark key={badge.id} badge={badge} sizeClass={sizeClass} imageSizeClass={imageSizeClass} />
      ))}
      {badges.length > limit && (
        <span className="inline-flex h-[17px] shrink-0 items-center rounded-full bg-white/10 px-1.5 text-[9px] font-semibold text-discord-text-muted" title={`${badges.length - limit} outras insígnias`}>
          +{badges.length - limit}
        </span>
      )}
    </span>
  );
}

function BadgeMark({ badge, sizeClass, imageSizeClass }: { badge: CustomBadge; sizeClass: string; imageSizeClass: string }) {
  const label = badgeHoverLabel(badge);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  return (
    <span
      title={label}
      aria-label={label}
      className={`custom-profile-badge relative inline-flex shrink-0 items-center justify-center font-semibold leading-none ${sizeClass}`}
      style={{ color: badge.foregroundColor }}
      onMouseEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTip({ x: rect.left + rect.width / 2, y: rect.top });
      }}
      onMouseLeave={() => setTip(null)}
      onFocus={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTip({ x: rect.left + rect.width / 2, y: rect.top });
      }}
      onBlur={() => setTip(null)}
    >
      {badge.imageUrl ? <img src={badge.imageUrl.startsWith("/bankai/") ? `${badge.imageUrl.split("?")[0]}?v=3` : badge.imageUrl} alt="" className={`${imageSizeClass} object-contain`}/> : badge.icon}
      {tip && typeof document !== "undefined" && createPortal(
        <span role="tooltip" className="pointer-events-none fixed z-[80] max-w-[240px] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-white/10 bg-[#111214] px-2 py-1 text-[11px] font-medium text-white shadow-lg" style={{ left: tip.x, top: tip.y - 6 }}>
          {label}
        </span>,
        document.body
      )}
    </span>
  );
}
