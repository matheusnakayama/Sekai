import { BANKAIS } from "@/lib/bankai";

export interface CustomBadge {
  id: string;
  name: string;
  icon: string;
  backgroundColor: string;
  foregroundColor: string;
  imageUrl?: string | null;
}

export function mapUserBadgeRows(rows: unknown): Map<string, CustomBadge[]> {
  const badgesByUser = new Map<string, CustomBadge[]>();
  if (!Array.isArray(rows)) return badgesByUser;

  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const relation = row.custom_badges;
    const badge = (Array.isArray(relation) ? relation[0] : relation) as Record<string, unknown> | null;
    if (!badge || typeof row.user_id !== "string" || typeof badge.id !== "string") continue;

    const userBadges = badgesByUser.get(row.user_id) ?? [];
    userBadges.push({
      id: badge.id,
      name: typeof badge.name === "string" ? badge.name : "Insígnia",
      icon: typeof badge.icon === "string" ? badge.icon : "✦",
      backgroundColor: typeof badge.background_color === "string" ? badge.background_color : "#4f46e5",
      foregroundColor: typeof badge.foreground_color === "string" ? badge.foreground_color : "#ffffff",
      imageUrl: typeof badge.image_url === "string" ? badge.image_url : null,
    });
    badgesByUser.set(row.user_id, userBadges);
  }

  return badgesByUser;
}

/** Nome da Bankai no hover; insígnias comuns continuam com o próprio nome. */
export function badgeHoverLabel(badge: { id: string; name: string }) {
  return BANKAIS.find((item) => item.badgeId === badge.id)?.bankai ?? badge.name;
}
