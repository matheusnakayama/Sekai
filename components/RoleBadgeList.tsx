import type { CSSProperties } from "react";

export interface RoleBadge {
  id: string;
  name: string;
  color?: string | null;
  iconUrl?: string | null;
  insigniaUrl?: string | null;
}

export function RoleIcon({ role, size = "small" }: { role: RoleBadge; size?: "small" | "medium" }) {
  const dimensions = size === "medium" ? "h-4 w-4" : "h-3.5 w-3.5";

  if (role.iconUrl) {
    return <img src={role.iconUrl} alt="" loading="lazy" className={`${dimensions} shrink-0 rounded-full object-cover`} />;
  }

  return <span aria-hidden="true" className={`${dimensions} shrink-0 rounded-full border border-white/15`} style={{ backgroundColor: role.color || "#99aab5" }} />;
}

export function RoleInsignia({ role, size = "small" }: { role: RoleBadge; size?: "small" | "medium" }) {
  const dimensions = size === "medium" ? "h-4 w-4" : "h-3.5 w-3.5";
  if (role.insigniaUrl) {
    return <img src={role.insigniaUrl} alt="" loading="lazy" className={`${dimensions} shrink-0 object-contain`} />;
  }
  return <span aria-hidden="true" className={`${dimensions} shrink-0 rounded-full`} style={{ backgroundColor: role.color || "#99aab5" }} />;
}

export function RoleBadgeList({
  roles,
  limit = 3,
  size = "medium",
  layout = "inline",
}: {
  roles?: RoleBadge[] | null;
  limit?: number;
  size?: "small" | "medium";
  layout?: "inline" | "profile";
}) {
  if (!roles?.length) return null;

  const profileLayout = layout === "profile";
  const visibleRoles = profileLayout ? roles : roles.slice(0, limit);
  const compact = size === "small";

  return (
    <span className={profileLayout ? "flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1" : "inline-flex min-w-0 flex-wrap items-center gap-1"} aria-label={`${roles.length} cargos`}>
      {visibleRoles.map((role) => {
        const accent = role.color || "#99aab5";
        const style: CSSProperties = {
          borderColor: `${accent}48`,
          backgroundColor: "rgba(255,255,255,0.035)",
          color: accent,
        };

        return (
          <span
            key={role.id}
            title={role.name}
            className={profileLayout
              ? "inline-flex h-6 w-fit max-w-full flex-none items-center gap-1.5 rounded-full border border-white/[0.06] bg-[#27282b] px-2.5 text-[11px] font-medium leading-none text-[#dbdee1]"
              : `inline-flex max-w-full shrink items-center rounded-md border font-semibold leading-none ${compact ? "gap-1 px-1.5 py-1 text-[10px]" : "gap-1.5 px-2.5 py-1.5 text-[11px]"}`}
            style={profileLayout ? undefined : style}
          >
            <RoleIcon role={role} size={profileLayout || !compact ? "medium" : "small"} />
            <span className="min-w-0 truncate">{role.name}</span>
            <RoleInsignia role={role} size="small" />
          </span>
        );
      })}
      {!profileLayout && roles.length > limit && (
        <span
          title={`${roles.length - limit} outros cargos`}
          className={`inline-flex shrink-0 items-center rounded-full bg-white/[0.08] font-semibold text-discord-text-muted ${compact ? "px-1.5 py-1 text-[10px]" : "px-2 py-1.5 text-[10px]"}`}
        >
          +{roles.length - limit}
        </span>
      )}
    </span>
  );
}
