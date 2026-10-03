import type { CustomBadge } from "@/lib/badges";

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
        <span
          key={badge.id}
          title={badge.name}
          aria-label={badge.name}
          className={`custom-profile-badge inline-flex shrink-0 items-center justify-center font-semibold leading-none ${sizeClass}`}
          style={{ color: badge.foregroundColor }}
        >
          {badge.imageUrl ? <img src={badge.imageUrl} alt="" className={`${imageSizeClass} object-contain`}/> : badge.icon}
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
