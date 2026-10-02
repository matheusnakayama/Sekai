import type { CustomBadge } from "@/lib/badges";

export function CustomBadgeList({ badges, limit = 4, size = "small" }: {
  badges?: CustomBadge[] | null;
  limit?: number;
  size?: "small" | "medium";
}) {
  if (!badges?.length) return null;
  const visibleBadges = badges.slice(0, limit);
  const sizeClass = size === "medium" ? "h-[21px] min-w-[21px] text-[12px]" : "h-[17px] min-w-[17px] text-[10px]";
  const imageWidthClass = size === "medium" ? "w-[21px]" : "w-[17px]";

  return (
    <span className="inline-flex min-w-0 items-center gap-1 align-middle" aria-label={`${badges.length} insígnias`}>
      {visibleBadges.map((badge) => (
        <span
          key={badge.id}
          title={badge.name}
          aria-label={badge.name}
          className={`custom-profile-badge inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none shadow-sm ring-1 ring-white/10 ${sizeClass} ${badge.imageUrl ? `overflow-hidden p-0 ${imageWidthClass}` : "px-1"}`}
          style={{ backgroundColor: badge.backgroundColor, color: badge.foregroundColor }}
        >
          {badge.imageUrl ? <img src={badge.imageUrl} alt="" className="h-full w-full rounded-full object-cover"/> : badge.icon}
        </span>
      ))}
      {badges.length > limit && (
        <span className="inline-flex h-[17px] shrink-0 items-center rounded-full bg-white/10 px-1.5 text-[9px] font-semibold text-discord-text-muted" title={`${badges.length - limit} outras insígnias`}>
          +{badges.length - limit}
        </span>
      )}
    </span>
  );
}
