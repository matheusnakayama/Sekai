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

/** Nome, ícone e banner são devolvidos apenas pela RPC limitada por usuário. */
export async function loadInvitePreview(supabase: SupabaseClient, code: string): Promise<ServerInvitePreview | null> {
  const normalized = code.trim();
  if (!isInviteCode(normalized)) return null;
  await supabase.auth.getSession();

  const remote = await supabase.rpc("preview_invite", { p_code: normalized });
  return remote.error ? null : parseInvitePreview(remote.data);
}
