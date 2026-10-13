"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Activity, Check, MoreHorizontal, MessageCircle, SendHorizontal, UserPlus, UserMinus, Plus, Search, Users, Pencil, Headphones, ZoomIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { RoleBadgeList, RoleIcon } from "@/components/RoleBadgeList";
import { CroppedProfileImage, ProfileBanner } from "@/components/ProfileBanner";
import type { RoleBadge } from "@/components/RoleBadgeList";
import type { CustomBadge } from "@/lib/badges";
import { cn, getProfilePalette } from "@/lib/utils";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { NowPlayingCard, ProfileConnections, useConnections, useNowPlaying } from "@/components/NowPlayingCard";
import { GameActivityCard, useGameActivity } from "@/components/NowPlayingCard";

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

export interface ProfileVoiceActivity {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  participants: Array<{ id: string; name: string; avatarUrl?: string | null }>;
}

const MUTUAL_SERVERS_CACHE_TTL_MS = 60_000;
const mutualServersCache = new Map<string, { items: MutualServer[]; expiresAt: number }>();
const mutualServersRequests = new Map<string, Promise<MutualServer[]>>();
const userServerIdsCache = new Map<string, { ids: Set<string>; expiresAt: number }>();
const userServerIdsRequests = new Map<string, Promise<Set<string>>>();
const PROFILE_URL_PATTERN = /https?:\/\/[^\s<>"`]+/gi;

function renderProfileBio(bio: string, color: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of bio.matchAll(PROFILE_URL_PATTERN)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;
    const url = rawUrl.replace(/[.,!?;:)]+$/g, "");
    const trailing = rawUrl.slice(url.length);
    if (!url) continue;

    if (start > cursor) parts.push(bio.slice(cursor, start));
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        parts.push(
          <a
            key={`profile-link-${key++}`}
            href={parsed.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline decoration-white/30 underline-offset-2 hover:text-white hover:decoration-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand"
            style={{ color }}
          >
            {url}
          </a>,
        );
      } else {
        parts.push(url);
      }
    } catch {
      parts.push(url);
    }
    if (trailing) parts.push(trailing);
    cursor = start + rawUrl.length;
  }

  if (cursor < bio.length) parts.push(bio.slice(cursor));
  return parts;
}

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
  voiceActivity,
  onOpenVoiceActivity,
  onOpenSettings,
  onOpenFullProfile,
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
  voiceActivity?: ProfileVoiceActivity;
  onOpenVoiceActivity?: (activity: ProfileVoiceActivity) => void;
  onOpenSettings?: () => void;
  onOpenFullProfile?: () => void;
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
  const listening = useNowPlaying(profile.id, profile.status);
  const gameActivity = useGameActivity(profile.id, profile.status);
  const isOtherUser = profile.id !== currentUserId;
  const [profileTab, setProfileTab] = useState<"atividade" | "amigos" | "servidores">("atividade");
  const [mutualFriends, setMutualFriends] = useState<Array<{ id: string; name: string; avatarUrl?: string | null }>>([]);
  const [mutualFriendsLoaded, setMutualFriendsLoaded] = useState(false);
  const connections = useConnections(profile.id, !isOtherUser);
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
    async function loadMutualFriends() {
      setMutualFriendsLoaded(false);
      const { data: ownEdges, error: ownError } = await supabase.from("friendships").select("sender_id, receiver_id").eq("status", "accepted").or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);
      if (ownError || cancelled) { setMutualFriendsLoaded(true); return; }
      const friendIds = (ownEdges ?? []).map((edge: any) => edge.sender_id === currentUserId ? edge.receiver_id : edge.sender_id).filter((id: string) => id !== profile.id);
      let mutualIds = friendIds;
      if (isOtherUser) {
        const { data: theirEdges, error: theirError } = await supabase.from("friendships").select("sender_id, receiver_id").eq("status", "accepted").or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`);
        if (theirError || cancelled) { setMutualFriendsLoaded(true); return; }
        const theirs = new Set((theirEdges ?? []).map((edge: any) => edge.sender_id === profile.id ? edge.receiver_id : edge.sender_id));
        mutualIds = friendIds.filter((id: string) => theirs.has(id));
      }
      const { data: profiles } = mutualIds.length
        ? await supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", mutualIds.slice(0, 40))
        : { data: [] };
      if (cancelled) return;
      setMutualFriends((profiles ?? []).map((item: any) => ({ id: item.id, name: item.display_name || item.username || "Usuário", avatarUrl: item.avatar_url })));
      setMutualFriendsLoaded(true);
    }
    void loadMutualFriends();
    return () => { cancelled = true; };
  }, [currentUserId, isOtherUser, profile.id, supabase]);

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
    setProfileTab("atividade");
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
      style={{ left: resolvedPosition.left, top: resolvedPosition.top, background: profilePalette.background, color: profilePalette.text, borderColor: profilePalette.border }}
      className="user-profile-card-scroll profile-card-enter fixed z-[150] max-h-[calc(100dvh-24px)] w-[min(300px,calc(100vw-24px))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[22px] border shadow-[0_24px_80px_rgba(0,0,0,.62)]"
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
          <button type="button" onClick={() => {
            if (isOtherUser && onOpenFullProfile) { onClose(); onOpenFullProfile(); }
            else if (!isOtherUser && onOpenSettings) { onClose(); onOpenSettings(); }
          }} disabled={isOtherUser ? !onOpenFullProfile : !onOpenSettings} aria-label={isOtherUser ? `Abrir perfil completo de ${profile.displayName}` : "Editar avatar e perfil"} title={isOtherUser ? "Abrir perfil completo" : "Editar perfil"} className={cn("group relative h-full w-full overflow-hidden rounded-full border-4 bg-discord-brand", (isOtherUser && onOpenFullProfile || !isOtherUser && onOpenSettings) && "cursor-pointer")} style={{ borderColor: profilePalette.surface }}>
            {profile.avatarUrl ? (
              <CroppedProfileImage src={profile.avatarUrl} alt="" className="rounded-full" pauseGif={false} positionX={Math.min(100, (profile.avatarPositionX ?? 50) + 5)} positionY={profile.avatarPositionY} zoom={profile.avatarZoom} />
            ) : (
              <span className="grid h-full place-items-center text-2xl font-bold text-white">{profile.displayName[0]?.toUpperCase()}</span>
            )}
            {(isOtherUser && onOpenFullProfile || !isOtherUser && onOpenSettings) && <span className="absolute inset-0 grid place-items-center rounded-full bg-black/0 text-white opacity-0 transition duration-200 group-hover:bg-black/55 group-hover:opacity-100 group-focus-visible:bg-black/55 group-focus-visible:opacity-100">{isOtherUser ? <ZoomIn size={18}/> : <Pencil size={18}/>}</span>}
          </button>
          <span className="pointer-events-none absolute -top-2 left-0 z-20 h-16 w-16">
            <PresenceIndicator presence={profile.status} avatarBadge borderColor={profilePalette.surface} cutoutColor={profilePalette.surface} className="scale-110 translate-y-2" />
          </span>
        </div>

        <div className="mt-2">
          <h2 className="truncate font-sans text-[21px] font-semibold leading-7 tracking-tight">{profile.displayName}</h2>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]" style={{ color: profilePalette.muted }}>
            <span className="truncate">@{username}</span>
            {profile.pronouns && <><span aria-hidden="true">·</span><span>{profile.pronouns}</span></>}
            <CustomBadgeList badges={profile.badges} limit={5} size="medium" />
          </div>

          <div role="tablist" aria-label="Seções do perfil" className="mt-3 flex gap-1 overflow-x-auto border-b border-white/[0.12]">
            {([ ["atividade", "Atividade"], ["amigos", isOtherUser ? "Amigos mútuos" : "Amigos"], ["servidores", "Servidores mútuos"] ] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={profileTab === id} onClick={() => setProfileTab(id)} className={cn("shrink-0 border-b-2 px-2 py-2 text-[11px] font-semibold transition", profileTab === id ? "border-discord-brand text-white" : "border-transparent text-white/55 hover:text-white/85")}>{label}{id === "amigos" && <span className="ml-1 text-white/45">{mutualFriendsLoaded ? mutualFriends.length : "…"}</span>}{id === "servidores" && <span className="ml-1 text-white/45">{mutualServers.length}</span>}</button>)}
          </div>

          {profileTab === "atividade" && <>
          {gameActivity && <GameActivityCard activity={gameActivity} />}
          {listening && <NowPlayingCard activity={listening} />}
          {voiceActivity && <div className="mt-3 rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-white/65"><Headphones size={14}/>Em voz</div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-14 shrink-0 flex-wrap content-center justify-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/20 p-1">{voiceActivity.participants.slice(0,4).map((person) => <span key={person.id} className="h-5 w-5 overflow-hidden rounded-full bg-white/10">{person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center text-[9px]">{person.name.slice(0,1)}</span>}</span>)}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{voiceActivity.channelName}</span><span className="block truncate text-xs text-white/55">em {voiceActivity.serverName} · {voiceActivity.participants.length} na chamada</span></span>
            </div>
            {onOpenVoiceActivity && <button type="button" onClick={() => { onClose(); onOpenVoiceActivity(voiceActivity); }} className="mt-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold hover:bg-white/10">Abrir chamada</button>}
          </div>}
          {profile.customStatus && <div className="mt-3 flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-[#1a1a1d] px-3 py-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: profilePalette.inset, color: profilePalette.muted }}><Activity size={16}/></span><span className="min-w-0 truncate text-xs font-semibold">{profile.customStatus}</span></div>}
          {profile.bio && <div className="mt-3"><p className="whitespace-pre-wrap break-words text-[13px] leading-5" style={{ color: profilePalette.muted }}>{renderProfileBio(profile.bio, profilePalette.muted)}</p></div>}
          </>}

          {profileTab === "amigos" && <div className="mt-2">
            {!mutualFriendsLoaded ? <p className="py-4 text-center text-xs text-white/50">Carregando amigos…</p> : mutualFriends.length ? mutualFriends.map((friend) => <div key={friend.id} className="flex items-center gap-2 rounded-lg px-1.5 py-2"><span className="h-8 w-8 overflow-hidden rounded-full bg-white/10">{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center text-xs">{friend.name.slice(0,1)}</span>}</span><span className="truncate text-xs font-semibold">{friend.name}</span></div>) : <p className="py-4 text-center text-xs text-white/50">Nenhum amigo mútuo</p>}
          </div>}

          {profileTab === "servidores" && <div className="mt-2">{mutualServers.length ? mutualServers.map((server) => <div key={server.id} className="flex items-center gap-2 rounded-lg px-1.5 py-2"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 text-xs font-bold">{server.iconUrl ? <img src={server.iconUrl} alt="" className="h-full w-full object-cover"/> : server.name.slice(0,1)}</span><span className="truncate text-xs font-semibold">{server.name}</span></div>) : <p className="py-4 text-center text-xs text-white/50">Nenhum servidor em comum</p>}</div>}

          {mutualServers.length > 0 && profileTab === "atividade" && (
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

          {profileTab === "atividade" && <ProfileConnections connections={connections} showAdd={!isOtherUser} />}

          {profile.assignedRoles?.length ? (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Cargos deste membro">
              <RoleBadgeList roles={profile.assignedRoles} size="medium" layout="profile" profileIsLight={profilePalette.isLight} />
              {canManageRoles && roles.length > 0 && (
                <button ref={rolePickerTriggerRef} type="button" onClick={toggleRolePicker} aria-label="Adicionar ou remover cargos" title="Adicionar cargo" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition hover:border-white/40 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand ${profilePalette.isLight ? "border-white/50 bg-white/[0.32] text-[#202124]" : "border-white/[0.22] bg-white/[0.10] text-[#f2f3f5]"}`}>
                  <Plus size={15} />
                </button>
              )}
            </div>
          ) : null}

          {canManageRoles && roles.length > 0 && !profile.assignedRoles?.length && (
            <div className="mt-3">
              <button ref={rolePickerTriggerRef} type="button" onClick={toggleRolePicker} aria-label="Adicionar cargos" title="Adicionar cargos" className={`grid h-6 w-6 place-items-center rounded-full border backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition hover:border-white/40 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand ${profilePalette.isLight ? "border-white/50 bg-white/[0.32] text-[#202124]" : "border-white/[0.22] bg-white/[0.10] text-[#f2f3f5]"}`}><Plus size={15} /></button>
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
