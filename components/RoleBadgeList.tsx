import type { CSSProperties } from "react";

export interface RoleBadge {
  id: string;
  name: string;
  color?: string | null;
  iconUrl?: string | null;
}

export function RoleIcon({ role, size = "small" }: { role: RoleBadge; size?: "small" | "medium" }) {
  const dimensions = size === "medium" ? "h-4 w-4" : "h-3.5 w-3.5";

  if (role.iconUrl) {
    return <img src={role.iconUrl} alt="" loading="lazy" className={`${dimensions} shrink-0 rounded-full object-cover`} />;
  }

  return <span aria-hidden="true" className={`${dimensions} shrink-0 rounded-full border border-white/15`} style={{ backgroundColor: role.color || "#99aab5" }} />;
}

export function RoleBadgeList({
  roles,
  limit = 3,
  size = "medium",
}: {
  roles?: RoleBadge[] | null;
  limit?: number;
  size?: "small" | "medium";
}) {
  if (!roles?.length) return null;

  const visibleRoles = roles.slice(0, limit);
  const compact = size === "small";

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1" aria-label={`${roles.length} cargos`}>
      {visibleRoles.map((role) => {
        const accent = role.color || "#99aab5";
        const style: CSSProperties = {
          borderColor: `${accent}55`,
          backgroundColor: `${accent}18`,
          color: accent,
        };

        return (
          <span
            key={role.id}
            title={role.name}
            className={`inline-flex max-w-full shrink items-center rounded-full border font-semibold leading-none ${compact ? "gap-1 px-1.5 py-1 text-[10px]" : "gap-1.5 px-2.5 py-1.5 text-[11px]"}`}
            style={style}
          >
            <RoleIcon role={role} size={compact ? "small" : "medium"} />
            <span className="truncate">{role.name}</span>
          </span>
        );
      })}
      {roles.length > limit && (
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
