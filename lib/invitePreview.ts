import type { SupabaseClient } from "@supabase/supabase-js";
import { isInviteCode } from "@/lib/invites";

export type ServerInvitePreview = {
  name: string;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  createdAt?: string | null;
  online?: number | null;
  members?: number | null;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function parseInvitePreview(data: unknown): ServerInvitePreview | null {
  let value = data;
  if (typeof value === "string") {
    try { value = JSON.parse(value) as unknown; } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = text(row.name);
  if (!name) return null;
  return {
    name,
    iconUrl: text(row.iconUrl) ?? text(row.icon_url),
    bannerUrl: text(row.bannerUrl) ?? text(row.banner_url),
    createdAt: text(row.createdAt) ?? text(row.created_at),
    online: count(row.online),
    members: count(row.members),
  };
}

type MemberRow = { profiles?: { status?: string | null } | { status?: string | null }[] | null };

function presenceCounts(rows: MemberRow[] | null) {
  if (!rows) return { online: null as number | null, members: null as number | null };
  const online = rows.filter((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return profile?.status === "online" || profile?.status === "idle" || profile?.status === "dnd";
  }).length;
  return { online, members: rows.length };
}

async function serverPreview(supabase: SupabaseClient, serverId: string): Promise<ServerInvitePreview | null> {
  const withBanner = await supabase.from("servers").select("name, icon_url, banner_url, created_at").eq("id", serverId).maybeSingle();
  const row = withBanner.error
    ? (await supabase.from("servers").select("name, icon_url, created_at").eq("id", serverId).maybeSingle()).data
    : withBanner.data;
  const record = row as Record<string, unknown> | null;
  const name = text(record?.name);
  if (!name) return null;

  const members = await supabase.from("members").select("user_id, profiles(status)").eq("server_id", serverId);
  const counts = members.error ? { online: null, members: null } : presenceCounts((members.data ?? []) as MemberRow[]);
  return {
    name,
    iconUrl: text(record?.icon_url),
    bannerUrl: text(record?.banner_url),
    createdAt: text(record?.created_at),
    online: counts.online,
    members: counts.members,
  };
}

async function serverIdForCode(supabase: SupabaseClient, code: string) {
  const invite = await supabase.from("invites").select("server_id").ilike("code", code).limit(1);
  const invited = (invite.data?.[0] as { server_id?: string } | undefined)?.server_id;
  if (invited) return invited;
  const legacy = await supabase.from("servers").select("id").ilike("invite_code", code).limit(1);
  return (legacy.data?.[0] as { id?: string } | undefined)?.id ?? null;
}

/** Nome, ícone e banner do convite. Funciona para quem já está no servidor mesmo sem a função nova do banco. */
export async function loadInvitePreview(supabase: SupabaseClient, code: string): Promise<ServerInvitePreview | null> {
  const normalized = code.trim();
  if (!isInviteCode(normalized)) return null;
  await supabase.auth.getSession();

  const remote = await supabase.rpc("preview_invite", { p_code: normalized });
  const parsed = remote.error ? null : parseInvitePreview(remote.data);
  if (parsed) return parsed;

  const serverId = await serverIdForCode(supabase, normalized);
  if (!serverId) return null;
  return serverPreview(supabase, serverId);
}
