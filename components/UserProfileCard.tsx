"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Check, MoreHorizontal, MessageCircle, SendHorizontal, UserPlus, UserMinus, Plus, Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { RoleBadgeList, RoleIcon } from "@/components/RoleBadgeList";
import { CroppedProfileImage, ProfileBanner } from "@/components/ProfileBanner";
import type { RoleBadge } from "@/components/RoleBadgeList";
import type { CustomBadge } from "@/lib/badges";
import { cn, getProfilePalette } from "@/lib/utils";
import { PresenceIndicator } from "@/components/PresenceIndicator";

export interface ProfileCardUser {
  id: string;
  displayName: string;
  username?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  customStatus?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bannerPositionX?: number | null;
  bannerPositionY?: number | null;
  bannerZoom?: number | null;
  avatarPositionX?: number | null;
  avatarPositionY?: number | null;
  avatarZoom?: number | null;
  profileCardColor?: string | null;
  badges?: CustomBadge[];
  assignedRoles?: RoleBadge[];
  status: "online" | "idle" | "dnd" | "offline";
  roleName: string;
  roleColor?: string;
}

export interface ProfileCardPosition {
  left: number;
  top: number;
  anchor?: HTMLElement;
}

interface ProfileRoleOption extends RoleBadge {
  position: number;
}

export interface MutualServer {
  id: string;
  name: string;
  iconUrl?: string | null;
}

const MUTUAL_SERVERS_CACHE_TTL_MS = 60_000;
const mutualServersCache = new Map<string, { items: MutualServer[]; expiresAt: number }>();
const mutualServersRequests = new Map<string, Promise<MutualServer[]>>();
const userServerIdsCache = new Map<string, { ids: Set<string>; expiresAt: number }>();
const userServerIdsRequests = new Map<string, Promise<Set<string>>>();

function mergeMutualServers(...groups: MutualServer[][]): MutualServer[] {
  const byId = new Map<string, MutualServer>();
  groups.flat().forEach((server) => {
    if (server?.id) byId.set(server.id, server);
  });
  return Array.from(byId.values());
}

async function getUserServerIds(supabase: ReturnType<typeof createClient>, userId: string) {
  const cached = userServerIdsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  const pending = userServerIdsRequests.get(userId);
  if (pending) return pending;

  const request = Promise.resolve(supabase.from("members").select("server_id").eq("user_id", userId)).then(({ data, error }) => {
    if (error) throw error;
    const ids = new Set((data ?? []).map((row: any) => row.server_id as string));
    userServerIdsCache.set(userId, { ids, expiresAt: Date.now() + MUTUAL_SERVERS_CACHE_TTL_MS });
    return ids;
  }).finally(() => userServerIdsRequests.delete(userId));
  userServerIdsRequests.set(userId, request);
  return request;
}

function getMutualServers(supabase: ReturnType<typeof createClient>, currentUserId: string, targetUserId: string) {
  const key = `${currentUserId}:${targetUserId}`;
  const cached = mutualServersCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.items);

  const pending = mutualServersRequests.get(key);
  if (pending) return pending;

  const request = Promise.all([
    getUserServerIds(supabase, currentUserId),
    Promise.resolve(supabase.from("members").select("server_id, servers(id, name, icon_url)").eq("user_id", targetUserId)),
  ]).then(([ownServerIds, targetMemberships]) => {
    if (targetMemberships.error) throw targetMemberships.error;
    const shared = (targetMemberships.data ?? []).flatMap((row: any) => {
      if (!ownServerIds.has(row.server_id)) return [];
      const joined = Array.isArray(row.servers) ? row.servers[0] : row.servers;
      return joined?.id ? [{ id: joined.id, name: joined.name, iconUrl: joined.icon_url }] : [];
    });
    mutualServersCache.set(key, { items: shared, expiresAt: Date.now() + MUTUAL_SERVERS_CACHE_TTL_MS });
    return shared;
  }).finally(() => mutualServersRequests.delete(key));
  mutualServersRequests.set(key, request);
  return request;
}

export function getProfileCardPosition(anchor: HTMLElement, preferRight = false): ProfileCardPosition {
  const bounds = anchor.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 24);
  const estimatedHeight = Math.min(380, window.innerHeight - 24);
  const roomRight = window.innerWidth - bounds.right - 12;
  const roomLeft = bounds.left - 12;
  const placeRight = preferRight && roomRight >= width;
  const left = placeRight
    ? bounds.right + 12
    : roomLeft >= width
      ? bounds.left - width - 12
      : Math.max(12, Math.min(bounds.right + 12, window.innerWidth - width - 12));
  const preferredTop = bounds.top - 24;
  const top = preferredTop + estimatedHeight <= window.innerHeight - 12
    ? preferredTop
    : bounds.top - estimatedHeight - 12 >= 12
      ? bounds.top - estimatedHeight - 12
      : Math.max(12, window.innerHeight - estimatedHeight - 12);

  return {
    left: Math.max(12, Math.min(left, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(top, window.innerHeight - estimatedHeight - 12)),
    anchor,
  };
}

export function UserProfileCard({
  profile,
  position,
  currentUserId,
  onClose,
  onMessage,
  onQuickMessage,
  onAddFriend,
  onKick,
  roles = [],
  assignedRoleIds = [],
  canManageRoles = false,
  onToggleRole,
  immediateMutualServer,
}: {
  profile: ProfileCardUser;
  position: ProfileCardPosition;
  currentUserId: string;
  onClose: () => void;
  onMessage?: () => void;
  onQuickMessage?: (content: string) => Promise<void>;
  onAddFriend?: () => void;
  onKick?: () => void;
  roles?: ProfileRoleOption[];
  assignedRoleIds?: string[];
  canManageRoles?: boolean;
  onToggleRole?: (role: ProfileRoleOption, assigned: boolean) => void;
  immediateMutualServer?: MutualServer | null;
}) {
  const supabase = createClient();
  const cardRef = useRef<HTMLElement>(null);
  const rolePickerRef = useRef<HTMLDivElement>(null);
  const rolePickerTriggerRef = useRef<HTMLButtonElement>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [rolePickerSearch, setRolePickerSearch] = useState("");
  const [rolePickerPosition, setRolePickerPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [mutualServerState, setMutualServerState] = useState<{ userId: string; items: MutualServer[] }>({ userId: "", items: [] });
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [quickMessage, setQuickMessage] = useState("");
  const [quickMessageError, setQuickMessageError] = useState("");
  const [sendingQuickMessage, setSendingQuickMessage] = useState(false);
  const [resolvedPosition, setResolvedPosition] = useState(position);
  const isOtherUser = profile.id !== currentUserId;
  const username = profile.username || profile.id.slice(0, 8);
  const profilePalette = getProfilePalette(profile.profileCardColor);
  const cachedMutualServers = isOtherUser && currentUserId
    ? mutualServersCache.get(`${currentUserId}:${profile.id}`)
    : undefined;
  const immediateServers = isOtherUser && immediateMutualServer ? [immediateMutualServer] : [];
  const mutualServers = mergeMutualServers(
    immediateServers,
    mutualServerState.userId === profile.id ? mutualServerState.items : [],
    cachedMutualServers && cachedMutualServers.expiresAt > Date.now() ? cachedMutualServers.items : [],
  );

  useEffect(() => {
    let cancelled = false;
    setMutualServerState({ userId: profile.id, items: immediateServers });
    if (!isOtherUser || !currentUserId) return () => { cancelled = true; };

    const cached = mutualServersCache.get(`${currentUserId}:${profile.id}`);
    if (cached && cached.expiresAt > Date.now()) {
      setMutualServerState({ userId: profile.id, items: mergeMutualServers(immediateServers, cached.items) });
      return () => { cancelled = true; };
    }

    void getMutualServers(supabase, currentUserId, profile.id)
      .then((servers) => {
        if (!cancelled) setMutualServerState({ userId: profile.id, items: mergeMutualServers(immediateServers, servers) });
      })
      .catch(() => {
        // Keep the current server visible when the additional memberships query fails.
      });
    return () => { cancelled = true; };
  }, [currentUserId, immediateMutualServer?.id, immediateMutualServer?.name, immediateMutualServer?.iconUrl, isOtherUser, profile.id, supabase]);

  function toggleRolePicker() {
    if (rolePickerOpen) {
      setRolePickerOpen(false);
      return;
    }
    const bounds = rolePickerTriggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.min(320, window.innerWidth - 24);
    const estimatedHeight = Math.min(360, window.innerHeight - 24);
    const left = Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12));
    const belowTop = bounds.bottom + 8;
    const top = belowTop + estimatedHeight <= window.innerHeight - 12
      ? belowTop
      : Math.max(12, bounds.top - estimatedHeight - 8);
    setRolePickerSearch("");
    setRolePickerPosition({ left, top, width });
    setRolePickerOpen(true);
  }

  function toggleActionsMenu() {
    if (actionsOpen) {
      setActionsOpen(false);
      return;
    }
    const bounds = actionsTriggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.min(192, window.innerWidth - 16);
    const estimatedHeight = onKick ? 92 : 48;
    const left = Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8));
    const belowTop = bounds.bottom + 8;
    const top = belowTop + estimatedHeight <= window.innerHeight - 8
      ? belowTop
      : Math.max(8, bounds.top - estimatedHeight - 8);
    setActionsMenuPosition({ left, top, width });
    setActionsOpen(true);
  }

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const updatePosition = () => {
      const anchor = position.anchor;
      const bounds = anchor?.isConnected ? anchor.getBoundingClientRect() : undefined;
      const cardHeight = card.getBoundingClientRect().height;
      const maxTop = window.innerHeight - cardHeight - 12;
      let top = position.top;
      let left = position.left;

      if (bounds) {
        const preferredTop = bounds.top - 24;
        const roomBelow = preferredTop + cardHeight <= window.innerHeight - 12;
        const roomAbove = bounds.top - cardHeight - 12 >= 12;
        top = roomBelow
          ? preferredTop
          : roomAbove
            ? bounds.top - cardHeight - 12
            : Math.max(12, maxTop);
      }

      const maxLeft = Math.max(12, window.innerWidth - card.getBoundingClientRect().width - 12);
      left = Math.max(12, Math.min(left, maxLeft));
      top = Math.max(12, Math.min(top, maxTop));

      setResolvedPosition((current) => current.left === left && current.top === top ? current : { ...position, left, top });
    };

    setResolvedPosition(position);
    updatePosition();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    observer?.observe(card);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [position, profile]);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (cardRef.current?.contains(target) || rolePickerRef.current?.contains(target) || actionsMenuRef.current?.contains(target)) return;
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (actionsOpen || rolePickerOpen) {
        setActionsOpen(false);
        setRolePickerOpen(false);
      } else {
        onClose();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsOpen, onClose, rolePickerOpen]);

  useEffect(() => {
    setActionsOpen(false);
    setRolePickerOpen(false);
  }, [profile.id]);

  async function submitQuickMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = quickMessage.trim();
    if (!content || !onQuickMessage || sendingQuickMessage) return;
    setSendingQuickMessage(true);
    setQuickMessageError("");
    try {
      await onQuickMessage(content);
      setQuickMessage("");
    } catch (error) {
      setQuickMessageError(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSendingQuickMessage(false);
    }
  }

  return createPortal(
    <section
      ref={cardRef}
      role="dialog"
      aria-label={`Perfil de ${profile.displayName}`}
      style={{ left: resolvedPosition.left, top: resolvedPosition.top, backgroundColor: profilePalette.surface, color: profilePalette.text, borderColor: profilePalette.border }}
      className="profile-card-enter fixed z-[150] max-h-[calc(100dvh-24px)] w-[min(300px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[22px] border shadow-[0_24px_80px_rgba(0,0,0,.62)]"
    >
      <ProfileBanner
        src={profile.bannerUrl}
        positionX={profile.bannerPositionX}
        positionY={profile.bannerPositionY}
        zoom={profile.bannerZoom}
        className="h-24"
      >
        <div className="absolute right-3 top-3 flex items-center gap-2">
          {isOtherUser && onAddFriend && (
            <button
              type="button"
              onClick={() => { onAddFriend(); onClose(); }}
              aria-label="Adicionar amigo"
              title="Adicionar amigo"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/45 text-white/90 shadow-lg backdrop-blur transition hover:bg-black/70 hover:text-white"
            >
              <UserPlus size={16} />
            </button>
          )}
          <button
            ref={actionsTriggerRef}
            type="button"
            aria-label="Mais opções do perfil"
            aria-expanded={actionsOpen}
            aria-haspopup="menu"
            onClick={toggleActionsMenu}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/45 text-white/90 shadow-lg backdrop-blur transition hover:bg-black/70 hover:text-white"
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      </ProfileBanner>

      {actionsOpen && actionsMenuPosition && createPortal(
        <div
          ref={actionsMenuRef}
          role="menu"
          aria-label={`Ações para ${profile.displayName}`}
          style={{ left: actionsMenuPosition.left, top: actionsMenuPosition.top, width: actionsMenuPosition.width }}
          className="profile-action-menu-enter fixed z-[210] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#18191c] p-1.5 text-white shadow-[0_14px_40px_rgba(0,0,0,.6)]"
        >
          {onKick && (
            <button role="menuitem" type="button" onClick={() => { setActionsOpen(false); onKick(); onClose(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10">
              <UserMinus size={15} /> Expulsar do servidor
            </button>
          )}
          <button role="menuitem" type="button" onClick={() => { setActionsOpen(false); onClose(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-discord-text-muted transition-colors hover:bg-white/[0.06] hover:text-white">
            Fechar perfil
          </button>
        </div>,
        document.body,
      )}

      <div className="px-4 pb-4">
        <div className="relative -mt-9 h-[68px] w-[68px]">
          <div className="relative h-full w-full overflow-hidden rounded-full border-4 bg-discord-brand" style={{ borderColor: profilePalette.surface }}>
            {profile.avatarUrl ? (
              <CroppedProfileImage src={profile.avatarUrl} alt="" className="rounded-full" positionX={profile.avatarPositionX} positionY={profile.avatarPositionY} zoom={profile.avatarZoom} />
            ) : (
              <span className="grid h-full place-items-center text-2xl font-bold text-white">{profile.displayName[0]?.toUpperCase()}</span>
            )}
          </div>
          <PresenceIndicator presence={profile.status} size={16} borderColor={profilePalette.surface} cutoutColor={profilePalette.surface} className="absolute bottom-0.5 right-0.5 border-[3px]" />
        </div>

        <div className="mt-2">
          <h2 className="truncate font-sans text-[21px] font-semibold leading-7 tracking-tight">{profile.displayName}</h2>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]" style={{ color: profilePalette.muted }}>
            <span className="truncate">@{username}</span>
            {profile.pronouns && <><span aria-hidden="true">·</span><span>{profile.pronouns}</span></>}
            <CustomBadgeList badges={profile.badges} limit={5} size="medium" />
          </div>

          {mutualServers.length > 0 && (
            <div className="mt-3 flex min-w-0 items-center gap-2 text-[11px]" style={{ color: profilePalette.muted }} aria-label={`${mutualServers.length} servidores em comum`}>
              <span className="flex shrink-0 -space-x-1.5">
                {mutualServers.slice(0, 3).map((server) => (
                  <span key={server.id} title={server.name} className="grid h-5 w-5 place-items-center overflow-hidden rounded-full border-2 bg-[#35363c] text-[8px] font-bold text-white/80" style={{ borderColor: profilePalette.surface }}>
                    {server.iconUrl ? <img src={server.iconUrl} alt="" className="h-full w-full object-cover" /> : server.name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </span>
              <Users size={13} className="shrink-0" />
              <span className="min-w-0 truncate">{mutualServers.length} servidor{mutualServers.length === 1 ? "" : "es"} em comum</span>
            </div>
          )}

          {profile.customStatus && (
            <div className="mt-3 flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-[#1a1a1d] px-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: profilePalette.inset, color: profilePalette.muted }}><Activity size={16} /></span>
              <span className="min-w-0 truncate text-xs font-semibold">{profile.customStatus}</span>
            </div>
          )}

          {profile.bio && (
            <div className="mt-3 border-t border-white/[0.08] pt-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[.12em]" style={{ color: profilePalette.muted }}>Sobre mim</p>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-5" style={{ color: profilePalette.muted }}>{profile.bio}</p>
            </div>
          )}

          {profile.assignedRoles?.length ? (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Cargos deste membro">
              <RoleBadgeList roles={profile.assignedRoles} size="medium" layout="profile" />
              {canManageRoles && roles.length > 0 && (
                <button ref={rolePickerTriggerRef} type="button" onClick={toggleRolePicker} aria-label="Adicionar ou remover cargos" title="Adicionar cargo" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/[0.12] bg-[#202124] text-white/65 transition hover:border-white/25 hover:bg-[#34353a] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand">
                  <Plus size={15} />
                </button>
              )}
            </div>
          ) : null}

          {canManageRoles && roles.length > 0 && !profile.assignedRoles?.length && (
            <div className="mt-3">
              <button ref={rolePickerTriggerRef} type="button" onClick={toggleRolePicker} aria-label="Adicionar cargos" title="Adicionar cargos" className="grid h-6 w-6 place-items-center rounded-full border border-white/[0.12] bg-[#202124] text-white/65 transition hover:border-white/25 hover:bg-[#34353a] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand"><Plus size={15} /></button>
            </div>
          )}

          {isOtherUser && onQuickMessage && (
            <>
              <form onSubmit={(event) => void submitQuickMessage(event)} className="mt-4 flex h-11 items-center gap-2 rounded-xl border px-3 transition focus-within:border-white/[0.24]" style={{ backgroundColor: profilePalette.inset, borderColor: profilePalette.isLight ? "rgba(0,0,0,.14)" : "rgba(255,255,255,.12)" }}>
                <input
                  aria-label={`Mensagem direta para @${username}`}
                  autoComplete="off"
                  maxLength={4000}
                  value={quickMessage}
                  onChange={(event) => setQuickMessage(event.target.value)}
                  placeholder={`Mensagem @${username}`}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-60"
                  style={{ color: profilePalette.text }}
                />
                <button type="submit" disabled={!quickMessage.trim() || sendingQuickMessage} aria-label="Enviar mensagem direta" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35" style={{ color: profilePalette.muted }}>
                  <SendHorizontal size={16} />
                </button>
              </form>
              {quickMessageError && <p role="alert" className="mt-1.5 px-1 text-[11px] leading-4 text-red-300">{quickMessageError}</p>}
            </>
          )}

          {isOtherUser && !onQuickMessage && onMessage && (
            <button type="button" onClick={() => { onMessage(); onClose(); }} className="mt-4 flex w-full items-center gap-2.5 rounded-xl bg-[#252528] px-3.5 py-3 text-left text-[13px] font-semibold text-white/90 transition hover:bg-[#303034]">
              <MessageCircle size={17} className="text-white/65" />
              <span className="min-w-0 flex-1 truncate">Enviar mensagem para @{username}</span>
            </button>
          )}
        </div>
      </div>
      {rolePickerOpen && rolePickerPosition && createPortal(
        <div ref={rolePickerRef} role="dialog" aria-label="Selecionar cargos" style={{ left: rolePickerPosition.left, top: rolePickerPosition.top, width: rolePickerPosition.width, maxHeight: Math.min(360, window.innerHeight - 24) }} className="fixed z-[170] overflow-hidden rounded-xl border border-white/[0.1] bg-[#232428] p-2 shadow-[0_16px_48px_rgba(0,0,0,.65)]">
          <label className="mb-2 flex h-10 items-center gap-2 rounded-lg border border-white/[0.12] bg-[#17181b] px-3 text-white/50 focus-within:border-discord-brand">
            <Search size={15} className="shrink-0" />
            <input autoFocus value={rolePickerSearch} onChange={(event) => setRolePickerSearch(event.target.value)} placeholder="Cargo" aria-label="Buscar cargos" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45" />
          </label>
          <div className="max-h-[300px] overflow-y-auto">
            {roles.filter((role) => role.name.toLocaleLowerCase().includes(rolePickerSearch.trim().toLocaleLowerCase())).map((role) => {
              const assigned = assignedRoleIds.includes(role.id);
              return <button key={role.id} type="button" role="checkbox" aria-checked={assigned} onClick={() => onToggleRole?.(role, assigned)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#dbdee1] transition hover:bg-white/[0.07]">
                <RoleIcon role={role} size="medium" />
                <span className="min-w-0 flex-1 truncate">{role.name}</span>
                {assigned && <Check size={15} className="shrink-0 text-discord-brand" />}
              </button>;
            })}
            {roles.filter((role) => role.name.toLocaleLowerCase().includes(rolePickerSearch.trim().toLocaleLowerCase())).length === 0 && <p className="px-3 py-5 text-center text-xs text-white/45">Nenhum cargo encontrado</p>}
          </div>
        </div>,
        document.body,
      )}
    </section>,
    document.body,
  );
}
