"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aggregateRolePermissions, hasPermission, PERMISSIONS, toBigInt } from "@/lib/permissions";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { ServerSettingsModal } from "@/components/ServerSettingsModal";
import { ServerSidebar, ServerItem } from "@/components/ServerSidebar";
import { CreateServerModal } from "@/components/CreateServerModal";
import { CreateChannelModal } from "@/components/CreateChannelModal";
import { useDialogs } from "@/components/DialogProvider";
import { ChannelSidebar, Channel, VoiceMemberPreview } from "@/components/ChannelSidebar";
import { ChatArea } from "@/components/ChatArea";
import { VoiceRoom } from "@/components/VoiceRoom";
import RoomClient from "@/components/call/RoomClient";
import { MemberList, MemberItem, ServerRoleOption } from "@/components/MemberList";
import { mapUserBadgeRows, type CustomBadge } from "@/lib/badges";
import { useChannelMessages } from "@/lib/chat/useChannelMessages";
import { executeSlashCommand, SLASH_COMMANDS } from "@/lib/commands/executeSlashCommand";
import { FriendsHome } from "@/components/FriendsHome";
import type { Participant } from "@/lib/types";

type VoiceControlHandle = { toggleMic: () => void; toggleDeafen: () => void };
type ServerMessageSettings = { autoModEnabled?: boolean; mentionLimit?: number; blockInviteLinks?: boolean; slowmodeSeconds?: number };

function channelCacheKey(userId: string, serverId: string) {
  return `${userId}:${serverId}`;
}

function readCachedChannels(userId: string, serverId: string): Channel[] | null {
  try {
    const cached = JSON.parse(window.localStorage.getItem(`sekai-channels:${userId}:${serverId}`) || "null");
    if (!Array.isArray(cached)) return null;
    return cached.filter((channel: any) =>
      channel && typeof channel.id === "string" && typeof channel.name === "string" &&
      (channel.type === "text" || channel.type === "voice")
    );
  } catch {
    return null;
  }
}

function writeCachedChannels(userId: string, serverId: string, channels: Channel[]) {
  try { window.localStorage.setItem(`sekai-channels:${userId}:${serverId}`, JSON.stringify(channels)); } catch { /* Cache local é opcional. */ }
}

function LoginScreen() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError("E-mail ou senha inválidos.");
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-discord-bg-primary">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg bg-discord-bg-secondary p-8 shadow-xl"
      >
        <h1 className="mb-1 text-2xl font-bold text-discord-header-primary">Bem-vindo de volta!</h1>
        <p className="mb-6 text-sm text-discord-text-muted">Entre no Sekai com seu convite.</p>

        <label className="mb-4 block text-xs font-semibold uppercase text-discord-text-muted">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded bg-discord-bg-primary px-3 py-2.5 text-discord-text-normal focus:outline-none"
          />
        </label>

        <label className="mb-2 block text-xs font-semibold uppercase text-discord-text-muted">
          Senha
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded bg-discord-bg-primary px-3 py-2.5 text-discord-text-normal focus:outline-none"
          />
        </label>

        {error && <p className="mb-2 text-sm text-discord-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded bg-theme-gradient py-2.5 font-medium text-white hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="mt-4 text-xs text-discord-text-muted">
          Sem conta? Peça um convite pra quem administra o servidor.
        </p>
      </form>
    </div>
  );
}

export default function Home() {
  const supabase = createClient();
  const dialogs = useDialogs();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const serversRef = useRef<ServerItem[]>([]);
  const serverListRequestSequence = useRef(0);
  const serverChannelsCache = useRef(new Map<string, Channel[]>());
  const serverMessageSettingsCache = useRef(new Map<string, ServerMessageSettings>());
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [mentionRequest, setMentionRequest] = useState<{ displayName: string; nonce: number } | null>(null);
  const mentionRequestRef = useRef(0);
  const [serverRoles, setServerRoles] = useState<ServerRoleOption[]>([]);
  const [myPermissions, setMyPermissions] = useState<bigint>(0n);
  const [isOwner, setIsOwner] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [activeServerId, setActiveServerId] = useState<string>("");
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const [activeChannelType, setActiveChannelType] = useState<"text" | "voice">("text");
  const [isServerLoading, setIsServerLoading] = useState(false);
  const serverLoadSequence = useRef(0);
  const [inviteVoiceChannelId, setInviteVoiceChannelId] = useState<string | null>(null);
  // Chamada de voz: fica montada enquanto você estiver conectado, mesmo ao trocar de canal.
  const [voiceSession, setVoiceSession] = useState<{
    channelId: string;
    channelName: string;
    accessToken: string;
  } | null>(null);
  const [callExpanded, setCallExpanded] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceParticipants, setVoiceParticipants] = useState<Participant[]>([]);
  const voiceControlsRef = useRef<VoiceControlHandle | null>(null);
  const [voiceControlState, setVoiceControlState] = useState({ micOn: true, deafened: false, isSpeaking: false });
  const [voiceMembersByChannel, setVoiceMembersByChannel] = useState<Record<string, VoiceMemberPreview[]>>({});
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [directMessageUserId, setDirectMessageUserId] = useState<string | null>(null);
  const [dmUnreadByUser, setDmUnreadByUser] = useState<Record<string, number>>({});
  const [dmToast, setDmToast] = useState<{ userId: string; name: string; avatarUrl: string | null; content: string; image: boolean } | null>(null);
  const [showCreateServer, setShowCreateServer] = useState(false);
  // undefined = janela fechada; null = criar sem categoria; string = categoria escolhida
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | null | undefined>(undefined);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [myProfile, setMyProfile] = useState<{ displayName: string; username?: string; pronouns?: string | null; bio?: string | null; customStatus?: string | null; avatarUrl?: string | null; avatarPositionX?: number; avatarPositionY?: number; avatarZoom?: number; bannerUrl?: string | null; bannerPositionX?: number; bannerPositionY?: number; bannerZoom?: number; profileCardColor?: string | null; badges?: CustomBadge[]; presence?: "online" | "idle" | "dnd" | "offline" | null } | null>(null);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase.channel(`sekai-dm-notifications:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sekai_direct_messages", filter: `receiver_id=eq.${currentUserId}` }, async (event) => {
        const row = event.new as { sender_id: string; content: string; attachment_url: string | null };
        const { data: profile } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", row.sender_id).maybeSingle();
        const name = profile?.display_name || profile?.username || "Nova mensagem";
        setDmUnreadByUser((previous) => ({ ...previous, [row.sender_id]: (previous[row.sender_id] || 0) + 1 }));
        setDmToast({ userId: row.sender_id, name, avatarUrl: profile?.avatar_url ?? null, content: row.content || (row.attachment_url ? "Enviou uma imagem" : "Nova mensagem"), image: !!row.attachment_url });
        window.setTimeout(() => setDmToast((current) => current?.userId === row.sender_id ? null : current), 7000);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, supabase]);

  async function loadMyProfile() {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, username, pronouns, bio, custom_status, avatar_url, avatar_position_x, avatar_position_y, avatar_zoom, banner_url, banner_position_x, banner_position_y, banner_zoom, profile_card_color, status")
      .eq("id", currentUserId)
      .single();
    if (data) {
      const { data: badgeRows } = await supabase
        .from("user_badges")
        .select("user_id, custom_badges(id, name, icon, background_color, foreground_color, image_url)")
        .eq("user_id", currentUserId);
      const badges = mapUserBadgeRows(badgeRows).get(currentUserId) ?? [];
      setMyProfile({
        displayName: data.display_name || data.username,
        username: data.username,
        pronouns: data.pronouns,
        bio: data.bio,
        customStatus: data.custom_status,
        avatarUrl: data.avatar_url,
        avatarPositionX: data.avatar_position_x ?? 50,
        avatarPositionY: data.avatar_position_y ?? 50,
        avatarZoom: data.avatar_zoom ?? 100,
        bannerUrl: data.banner_url,
        bannerPositionX: data.banner_position_x ?? 50,
        bannerPositionY: data.banner_position_y ?? 50,
        bannerZoom: data.banner_zoom ?? 100,
        profileCardColor: data.profile_card_color,
        badges,
        presence: data.status,
      });
    }
  }

  async function handlePresenceChange(presence: "online" | "idle" | "dnd" | "offline"): Promise<boolean> {
    if (!currentUserId) return false;
    const { data, error } = await supabase.from("profiles").update({ status: presence }).eq("id", currentUserId).select("id").maybeSingle();
    if (error || !data) {
      console.error("Não foi possível atualizar o status de presença.", error);
      return false;
    }
    setMyProfile((profile) => profile ? { ...profile, presence } : profile);
    void loadChannelsAndMembers();
    return true;
  }

  useEffect(() => {
    loadMyProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(`sekai-preferences:${currentUserId}`) || "{}");
      document.documentElement.dataset.density = saved.density === "compact" ? "compact" : "comfortable";
      document.documentElement.dataset.fontScale = saved.fontScale === "large" ? "large" : "normal";
      document.documentElement.dataset.reducedMotion = String(saved.reducedMotion === true);
    } catch {
      // As preferências locais padrão já estão aplicadas pelo CSS.
    }
  }, [currentUserId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setIsPlatformAdmin(false);
    if (!currentUserId) return () => { cancelled = true; };
    void supabase.rpc("is_sekai_admin").then(({ data, error }) => {
      if (cancelled) return;
      setIsPlatformAdmin(!error && data === true);
    });
    return () => { cancelled = true; };
  }, [currentUserId, supabase]);

  useEffect(() => {
    if (!currentUserId) {
      setOnlineUserIds([]);
      return;
    }

    const presenceChannel = supabase.channel("sekai:online-users", {
      config: { presence: { key: currentUserId } },
    });
    const updateOnlineUsers = () => {
      const state = presenceChannel.presenceState<{ user_id: string }>();
      const ids = Object.values(state).flat().map((presence) => presence.user_id);
      setOnlineUserIds(Array.from(new Set(ids)));
    };

    presenceChannel
      .on("presence", { event: "sync" }, updateOnlineUsers)
      .on("presence", { event: "join" }, updateOnlineUsers)
      .on("presence", { event: "leave" }, updateOnlineUsers)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void presenceChannel.track({ user_id: currentUserId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      void supabase.removeChannel(presenceChannel);
    };
  }, [currentUserId, supabase]);

  useEffect(() => {
    const onlineIds = new Set(onlineUserIds);
    setMembers((current) => current.map((member) => ({
      ...member,
      // O estado ao vivo determina se está conectado; o perfil escolhe o estado ativo.
      status: onlineIds.has(member.id)
        ? (member.profilePresence === "idle" || member.profilePresence === "dnd" ? member.profilePresence : "online")
        : "offline",
    })));
  }, [onlineUserIds]);

  async function loadServers() {
    if (!currentUserId) return [];
    const requestSequence = ++serverListRequestSequence.current;

    if (isPlatformAdmin) {
      let rows: any[] | null = null;
      let lastError: { message: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await supabase.from("servers").select("id, name, icon_url").order("name");
        if (!result.error) {
          rows = result.data ?? [];
          break;
        }
        lastError = result.error;
        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)));
      }
      if (!rows) {
        console.error("Não foi possível carregar os servidores administráveis:", lastError?.message);
        return serversRef.current;
      }
      const list = rows.map((server: any) => ({ id: server.id, name: server.name, iconUrl: server.icon_url }));
      if (requestSequence !== serverListRequestSequence.current) return serversRef.current;
      serversRef.current = list;
      setServers(list);
      try { window.localStorage.setItem(`sekai-server-list:${currentUserId}`, JSON.stringify(list)); } catch { /* Cache local é apenas uma melhoria de abertura. */ }
      return list;
    }

    let rows: any[] | null = null;
    let lastError: { message: string } | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase
        .from("members")
        .select("server_id, servers(id, name, icon_url)")
        .eq("user_id", currentUserId);
      if (!result.error) {
        rows = result.data ?? [];
        break;
      }
      lastError = result.error;
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)));
    }

    if (!rows) {
      console.error("Não foi possível carregar os servidores do usuário:", lastError?.message);
      return serversRef.current;
    }

    // Depois de resgatar um convite, a escrita pode aparecer alguns instantes
    // depois em uma leitura concorrente. Preserve a lista em tela e tente ler
    // novamente antes de interpretar uma resposta vazia como perda de acesso.
    if (rows.length === 0 && serversRef.current.length > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      const retry = await supabase
        .from("members")
        .select("server_id, servers(id, name, icon_url)")
        .eq("user_id", currentUserId);
      if (requestSequence !== serverListRequestSequence.current) return serversRef.current;
      if (retry.error) {
        console.error("Não foi possível confirmar a lista de servidores:", retry.error.message);
        return serversRef.current;
      }
      if (retry.data?.length) rows = retry.data;
      else return serversRef.current;
    }

    let list = rows.flatMap((row: any) => {
      const joinedServers = Array.isArray(row.servers) ? row.servers : row.servers ? [row.servers] : [];
      return joinedServers.filter((server: any) => server?.id).map((server: any) => ({
        id: server.id,
        name: server.name,
        iconUrl: server.icon_url,
      }));
    });
    const memberServerIds = [...new Set(rows.map((row: any) => row.server_id).filter(Boolean))] as string[];
    if (memberServerIds.length && list.length === 0) {
      const fallback = await supabase.from("servers").select("id, name, icon_url").in("id", memberServerIds);
      if (fallback.error) {
        console.error("Não foi possível resolver os servidores associados:", fallback.error.message);
        return serversRef.current;
      }
      list = (fallback.data ?? []).map((server: any) => ({ id: server.id, name: server.name, iconUrl: server.icon_url }));
    }

    if (requestSequence !== serverListRequestSequence.current) return serversRef.current;
    serversRef.current = list;
    setServers(list);
    try { window.localStorage.setItem(`sekai-server-list:${currentUserId}`, JSON.stringify(list)); } catch { /* Cache local é apenas uma melhoria de abertura. */ }
    return list;
  }

  useEffect(() => {
    if (!currentUserId || !isPlatformAdmin) return;
    void loadServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, isPlatformAdmin]);

  useEffect(() => {
    if (!currentUserId) return;

    let cachedServers: ServerItem[] | null = null;
    try {
      const value = JSON.parse(window.localStorage.getItem(`sekai-server-list:${currentUserId}`) || "null");
      if (Array.isArray(value)) {
        cachedServers = value.filter((server: any) => server && typeof server.id === "string" && typeof server.name === "string");
      }
    } catch { /* Um cache inválido é ignorado e refeito a partir do banco. */ }
    if (cachedServers) {
      serversRef.current = cachedServers;
      setServers(cachedServers);
    } else {
      serversRef.current = [];
      setServers([]);
    }

    async function openRequestedChannelOrDefaultServer() {
      const list = await loadServers();
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get("invite");
      if (inviteCode) {
        const { data: joinedServerId, error } = await supabase.rpc("redeem_invite", { p_code: inviteCode });
        if (!error && joinedServerId) {
          const requestedChannelId = params.get("voiceChannel");
          const { data: joinedServer } = await supabase.from("servers").select("id, name, icon_url").eq("id", joinedServerId).maybeSingle();
          if (joinedServer) {
            const optimisticList = [...serversRef.current.filter((server) => server.id !== joinedServer.id), {
              id: joinedServer.id,
              name: joinedServer.name,
              iconUrl: joinedServer.icon_url,
            }];
            serversRef.current = optimisticList;
            setServers(optimisticList);
            try { window.localStorage.setItem(`sekai-server-list:${currentUserId}`, JSON.stringify(optimisticList)); } catch { /* Cache local opcional. */ }
          }
          setActiveServerId(joinedServerId as string);
          if (requestedChannelId) setInviteVoiceChannelId(requestedChannelId);
          await loadServers();
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        await dialogs.notify({ title: "Convite indisponível", message: error?.message || "Não foi possível entrar com este convite." });
        window.history.replaceState({}, "", window.location.pathname);
        if (list?.[0]) setActiveServerId((current) => current || list[0].id);
        return;
      }
      const requestedChannelId = params.get("voiceChannel");
      if (requestedChannelId) {
        const { data: channel } = await supabase
          .from("channels")
          .select("id, server_id, type")
          .eq("id", requestedChannelId)
          .eq("type", "voice")
          .maybeSingle();
        if (channel) {
          setInviteVoiceChannelId(channel.id);
          setActiveServerId(channel.server_id);
          return;
        }
      }

      if (list?.[0]) setActiveServerId((current) => current || list[0].id);
    }
    void openRequestedChannelOrDefaultServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    if (!authChecked || currentUserId) return;
    serverListRequestSequence.current += 1;
    serversRef.current = [];
    serverChannelsCache.current.clear();
    serverMessageSettingsCache.current.clear();
    setServers([]);
    setActiveServerId("");
    setActiveChannelId("");
    setChannels([]);
    setMembers([]);
  }, [authChecked, currentUserId]);

  async function loadChannelsAndMembers() {
    const serverId = activeServerId;
    if (!serverId || !currentUserId) return;
    const sequence = ++serverLoadSequence.current;

    // Libera os canais assim que sua própria consulta termina. Categoria,
    // proprietário e membros não seguram mais a navegação.
    const channelResult = await supabase
      .from("channels")
      .select("id, name, type, category_id, position")
      .eq("server_id", serverId)
      .order("position");
    if (sequence !== serverLoadSequence.current) return;
    if (channelResult.error) {
      console.error("Não foi possível carregar os canais do servidor:", channelResult.error.message);
      setIsServerLoading(false);
      return;
    }

    const cachedKey = channelCacheKey(currentUserId, serverId);
    const cachedChannels = serverChannelsCache.current.get(cachedKey) ?? readCachedChannels(currentUserId, serverId) ?? [];
    const cachedCategoryNames = new Map<string | null, string>(cachedChannels.map((channel): [string | null, string] => [channel.categoryId, channel.categoryName]));
    const mappedChannels: Channel[] = (channelResult.data ?? []).map((channel: any) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      categoryId: channel.category_id,
      categoryName: cachedCategoryNames.get(channel.category_id) ?? "SEM CATEGORIA",
    }));
    serverChannelsCache.current.set(cachedKey, mappedChannels);
    writeCachedChannels(currentUserId, serverId, mappedChannels);
    setChannels(mappedChannels);

    const invitedChannel = inviteVoiceChannelId
      ? mappedChannels.find((channel) => channel.id === inviteVoiceChannelId && channel.type === "voice")
      : undefined;
    if (invitedChannel) {
      setActiveChannelId(invitedChannel.id);
      setActiveChannelType("voice");
      setInviteVoiceChannelId(null);
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      const nextChannel = mappedChannels.find((channel) => channel.id === activeChannelId) ?? mappedChannels[0];
      setActiveChannelId(nextChannel?.id ?? "");
      setActiveChannelType(nextChannel?.type ?? "text");
    }
    setIsServerLoading(false);

    const [serverResult, categoryResult, memberResult] = await Promise.all([
      supabase.from("servers").select("owner_id").eq("id", serverId).single(),
      supabase.from("channel_categories").select("id, name, position").eq("server_id", serverId).order("position"),
      supabase.from("members").select("user_id, nickname, avatar_url, avatar_position_x, avatar_position_y, avatar_zoom, banner_url, banner_position_x, banner_position_y, banner_zoom, profiles(display_name, username, pronouns, bio, custom_status, avatar_url, avatar_position_x, avatar_position_y, avatar_zoom, banner_url, banner_position_x, banner_position_y, banner_zoom, profile_card_color, status)").eq("server_id", serverId),
    ]);
    if (sequence !== serverLoadSequence.current) return;
    setIsOwner(serverResult.data?.owner_id === currentUserId);

    if (!categoryResult.error) {
      const categoryNameById = new Map((categoryResult.data ?? []).map((category: any) => [category.id, category.name]));
      const categorizedChannels = mappedChannels.map((channel) => ({
        ...channel,
        categoryName: channel.categoryId ? categoryNameById.get(channel.categoryId) ?? "SEM CATEGORIA" : "SEM CATEGORIA",
      }));
      serverChannelsCache.current.set(cachedKey, categorizedChannels);
      writeCachedChannels(currentUserId, serverId, categorizedChannels);
      setChannels((current) => current.map((channel) => {
        const updated = categorizedChannels.find((item) => item.id === channel.id);
        return updated ?? channel;
      }));
    }

    if (memberResult.error) {
      console.error("Não foi possível carregar os membros do servidor:", memberResult.error.message);
      return;
    }
    const memberRows = memberResult.data ?? [];
    const memberUserIds = [...new Set(memberRows.map((member: any) => member.user_id).filter(Boolean))];
    const badgeRequest = memberUserIds.length
        ? supabase.from("user_badges").select("user_id, custom_badges(id, name, icon, background_color, foreground_color, image_url)").in("user_id", memberUserIds)
        : Promise.resolve({ data: [], error: null });
    const [memberRoleResult, allRoleResult] = await Promise.all([
      supabase.from("member_roles").select("user_id, roles(id, name, color, icon_url, insignia_url, position, permissions, is_default)").eq("server_id", serverId),
      supabase.from("roles").select("id,name,color,icon_url,insignia_url,position,is_default").eq("server_id", serverId).order("position", { ascending: false }),
    ]);
    if (sequence !== serverLoadSequence.current) return;

    const memberRoleRows = memberRoleResult.data;
    const allServerRoles = allRoleResult.data;
    setServerRoles((allServerRoles ?? []).filter((role: any) => !role.is_default).map((role: any) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      iconUrl: role.icon_url,
      insigniaUrl: role.insignia_url,
      position: role.position,
    })));

    const rolesByUser = new Map<string, any[]>();
    (memberRoleRows ?? []).forEach((row: any) => {
      const list = rolesByUser.get(row.user_id) ?? [];
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      if (role) list.push(role);
      rolesByUser.set(row.user_id, list);
    });

    const existingBadgesByUser = new Map<string, CustomBadge[]>(members.map((member): [string, CustomBadge[]] => [member.id, member.badges ?? []]));
    const list: MemberItem[] = memberRows.map((m: any) => {
      const roles = rolesByUser.get(m.user_id) ?? [];
      const sortedRoles = [...roles].sort((a, b) => b.position - a.position);
      const visibleRoles = sortedRoles.filter((role) => !role.is_default);
      const topRole = visibleRoles[0] ?? sortedRoles[0];
      return {
        id: m.user_id,
        displayName: m.nickname || m.profiles?.display_name || m.profiles?.username || "Usuário",
        username: m.profiles?.username,
        pronouns: m.profiles?.pronouns,
        bio: m.profiles?.bio,
        customStatus: m.profiles?.custom_status,
        avatarUrl: m.avatar_url || m.profiles?.avatar_url,
        avatarPositionX: m.avatar_url ? m.avatar_position_x ?? 50 : m.profiles?.avatar_position_x ?? 50,
        avatarPositionY: m.avatar_url ? m.avatar_position_y ?? 50 : m.profiles?.avatar_position_y ?? 50,
        avatarZoom: m.avatar_url ? m.avatar_zoom ?? 100 : m.profiles?.avatar_zoom ?? 100,
        bannerUrl: m.banner_url || m.profiles?.banner_url,
        bannerPositionX: m.banner_url ? m.banner_position_x ?? 50 : m.profiles?.banner_position_x ?? 50,
        bannerPositionY: m.banner_url ? m.banner_position_y ?? 50 : m.profiles?.banner_position_y ?? 50,
        bannerZoom: m.banner_url ? m.banner_zoom ?? 100 : m.profiles?.banner_zoom ?? 100,
        profileCardColor: m.profiles?.profile_card_color,
        badges: existingBadgesByUser.get(m.user_id) ?? [],
        profilePresence: m.profiles?.status === "online" || m.profiles?.status === "idle" || m.profiles?.status === "dnd" || m.profiles?.status === "offline"
          ? m.profiles.status
          : "offline",
        status: onlineUserIds.includes(m.user_id)
          ? (m.profiles?.status === "idle" || m.profiles?.status === "dnd" ? m.profiles.status : "online")
          : "offline",
        roleId: topRole?.id,
        roleName: topRole?.name ?? "Membro",
        roleColor: topRole?.color,
        roleIconUrl: topRole?.icon_url,
        roleInsigniaUrl: topRole?.insignia_url,
        rolePosition: topRole?.position ?? 0,
        roleIds: visibleRoles.map((role) => role.id),
        assignedRoles: visibleRoles.map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          iconUrl: role.icon_url,
          insigniaUrl: role.insignia_url,
        })),
      };
    });
    setMembers(list);

    const myRoles = rolesByUser.get(currentUserId ?? "") ?? [];
    setMyPermissions(aggregateRolePermissions(myRoles.map((r) => r.permissions)));

    const badgeResult = await badgeRequest;
    if (sequence !== serverLoadSequence.current || badgeResult.error) return;
    const badgesByUser = mapUserBadgeRows(badgeResult.data);
    setMembers((current) => current.map((member) => ({ ...member, badges: badgesByUser.get(member.id) ?? [] })));
  }

  function handleSelectServer(serverId: string) {
    if (serverId === activeServerId) return;
    const cachedChannels = serverId && currentUserId
      ? serverChannelsCache.current.get(channelCacheKey(currentUserId, serverId)) ?? readCachedChannels(currentUserId, serverId) ?? undefined
      : undefined;
    if (serverId && currentUserId && cachedChannels) serverChannelsCache.current.set(channelCacheKey(currentUserId, serverId), cachedChannels);
    serverLoadSequence.current += 1;
    setIsServerLoading(Boolean(serverId && !cachedChannels));
    setActiveServerId(serverId);
    const firstCachedChannel = cachedChannels?.[0];
    setActiveChannelId(firstCachedChannel?.id ?? "");
    setActiveChannelType(firstCachedChannel?.type ?? "text");
    setChannels(cachedChannels ?? []);
    setMembers([]);
    setServerRoles([]);
    setIsOwner(false);
    setMyPermissions(0n);
  }

  useEffect(() => {
    const cachedChannels = activeServerId && currentUserId
      ? serverChannelsCache.current.get(channelCacheKey(currentUserId, activeServerId)) ?? readCachedChannels(currentUserId, activeServerId) ?? undefined
      : undefined;
    if (activeServerId && cachedChannels) {
      serverChannelsCache.current.set(channelCacheKey(currentUserId ?? "", activeServerId), cachedChannels);
      setChannels(cachedChannels);
      const currentChannel = cachedChannels.find((channel) => channel.id === activeChannelId) ?? cachedChannels[0];
      setActiveChannelId(currentChannel?.id ?? "");
      setActiveChannelType(currentChannel?.type ?? "text");
    }
    setIsServerLoading(Boolean(activeServerId && !cachedChannels));
    void loadChannelsAndMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId, currentUserId, isPlatformAdmin]);

  useEffect(() => {
    if (!activeServerId) return;
    let cancelled = false;
    const serverId = activeServerId;
    void supabase.from("server_preferences").select("settings").eq("server_id", serverId).maybeSingle().then(({ data, error }) => {
      if (!cancelled && !error) serverMessageSettingsCache.current.set(serverId, (data?.settings ?? {}) as ServerMessageSettings);
    });
    return () => { cancelled = true; };
  }, [activeServerId, supabase]);

  useEffect(() => {
    if (!activeServerId || !currentUserId) return;
    const channel = supabase.channel(`sekai-user-badges:${activeServerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_badges" }, () => {
        void loadChannelsAndMembers();
        void loadMyProfile();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId, currentUserId]);

  useEffect(() => {
    const voiceChannels = channels.filter((channel) => channel.type === "voice");
    if (!activeServerId || !currentUserId || !voiceChannels.length) {
      setVoiceMembersByChannel({});
      return;
    }
    let cancelled = false;
    async function refreshVoiceMembers() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const entries = await Promise.all(voiceChannels.map(async (channel) => {
        try {
          const response = await fetch(`/api/pusher/presence?channelId=${encodeURIComponent(channel.id)}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          });
          if (!response.ok) return [channel.id, []] as const;
          const payload = await response.json() as { members?: VoiceMemberPreview[] };
          return [channel.id, payload.members ?? []] as const;
        } catch {
          return [channel.id, []] as const;
        }
      }));
      if (!cancelled) setVoiceMembersByChannel(Object.fromEntries(entries));
    }
    void refreshVoiceMembers();
    const timer = window.setInterval(() => void refreshVoiceMembers(), 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeServerId, channels, currentUserId, supabase]);

  const canManageChannels = isOwner || isPlatformAdmin || hasPermission(myPermissions, "MANAGE_CHANNELS");

  const handleVoiceParticipantsChange = useCallback((participants: Participant[]) => {
    setVoiceParticipants(participants);
  }, []);

  const handleVoiceControlsReady = useCallback((controls: VoiceControlHandle | null) => {
    voiceControlsRef.current = controls;
  }, []);

  const handleVoiceControlStateChange = useCallback((state: { micOn: boolean; deafened: boolean; isSpeaking: boolean }) => {
    setVoiceControlState((current) => current.micOn === state.micOn && current.deafened === state.deafened && current.isSpeaking === state.isSpeaking ? current : state);
  }, []);

  async function handleAddFriend(userId: string) {
    if (!currentUserId || userId === currentUserId) return;
    const { error } = await supabase.from("friendships").insert({
      sender_id: currentUserId,
      receiver_id: userId,
      status: "pending",
    });
    if (error) {
      const migrationMissing = error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST200";
      await dialogs.notify({
        title: error.code === "23505" ? "Vocês já são amigos ou existe uma solicitação" : "Não foi possível adicionar",
        message: migrationMissing
          ? "A tabela de amizades não existe. Execute db/social_invites_migration.sql no SQL Editor do Supabase."
          : error.code === "42501"
            ? "O Supabase bloqueou esta solicitação pelas permissões de segurança (RLS). Confirme se a migração social foi aplicada por completo."
            : `O Supabase retornou: ${error.message}`,
      });
      return;
    }
    await dialogs.notify({ title: "Solicitação enviada", message: "A pessoa receberá seu pedido de amizade na tela Amigos." });
  }

  function handleMentionMember(member: MemberItem) {
    if (activeChannelType !== "text") {
      void dialogs.notify({ title: "Menção indisponível", message: "Abra um canal de texto para inserir uma menção na mensagem." });
      return;
    }
    mentionRequestRef.current += 1;
    setMentionRequest({ displayName: member.displayName, nonce: mentionRequestRef.current });
  }

  async function handleKickMember(member: MemberItem) {
    if (!activeServerId || member.id === currentUserId) return;
    const ok = await dialogs.confirm({ title: "Expulsar membro", message: `Expulsar ${member.displayName} deste servidor? Ele poderá voltar com um convite.`, confirmLabel: "Expulsar", danger: true });
    if (!ok) return;
    const { error } = await supabase.rpc("moderate_server_member", {
      p_server_id: activeServerId,
      p_user_id: member.id,
      p_action: "kick",
      p_reason: null,
    });
    if (error) { await dialogs.notify({ title: "Não foi possível expulsar", message: error.message }); return; }
    await loadChannelsAndMembers();
  }

  async function handleBanMember(member: MemberItem) {
    if (!activeServerId || member.id === currentUserId) return;
    const reason = await dialogs.prompt({
      title: `Banir ${member.displayName}`,
      label: "Motivo (opcional)",
      description: "A pessoa será removida do servidor e não poderá entrar novamente enquanto o banimento estiver ativo.",
      placeholder: "Motivo do banimento",
      allowEmpty: true,
      maxLength: 200,
      confirmLabel: "Banir",
    });
    if (reason === null) return;
    const { error } = await supabase.rpc("moderate_server_member", {
      p_server_id: activeServerId,
      p_user_id: member.id,
      p_action: "ban",
      p_reason: reason || null,
    });
    if (error) { await dialogs.notify({ title: "Não foi possível banir", message: error.message }); return; }
    await loadChannelsAndMembers();
  }

  async function handleTimeoutMember(member: MemberItem) {
    if (!activeServerId || member.id === currentUserId) return;
    const minutesText = await dialogs.prompt({
      title: `Aplicar timeout em ${member.displayName}`,
      label: "Duração em minutos",
      description: "Informe um valor de 1 a 40.320 minutos (até 28 dias).",
      placeholder: "10",
      defaultValue: "10",
      maxLength: 5,
      confirmLabel: "Aplicar timeout",
    });
    if (minutesText === null) return;
    const minutes = Number(minutesText);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
      await dialogs.notify({ title: "Duração inválida", message: "Informe um número inteiro de 1 a 40.320 minutos." });
      return;
    }
    const { error } = await supabase.rpc("set_server_member_timeout", {
      p_server_id: activeServerId,
      p_user_id: member.id,
      p_until: new Date(Date.now() + minutes * 60_000).toISOString(),
    });
    if (error) { await dialogs.notify({ title: "Não foi possível aplicar timeout", message: error.message }); return; }
    await loadChannelsAndMembers();
  }

  async function handleChangeMemberNickname(member: MemberItem) {
    if (!activeServerId || member.id === currentUserId) return;
    const nickname = await dialogs.prompt({
      title: `Alterar apelido de ${member.displayName}`,
      label: "Novo apelido",
      description: "Deixe vazio para remover o apelido e voltar a usar o nome do perfil.",
      placeholder: "Apelido",
      defaultValue: member.displayName,
      allowEmpty: true,
      maxLength: 32,
      confirmLabel: "Salvar apelido",
    });
    if (nickname === null) return;
    const { error } = await supabase.rpc("set_server_member_nickname", {
      p_server_id: activeServerId,
      p_user_id: member.id,
      p_nickname: nickname || null,
    });
    if (error) {
      const migrationMissing = error.code === "PGRST202" || error.message.includes("set_server_member_nickname");
      await dialogs.notify({
        title: "Não foi possível alterar o apelido",
        message: migrationMissing
          ? "Execute db/member_context_menu_migration.sql no SQL Editor do Supabase e tente novamente."
          : error.message,
      });
      return;
    }
    await loadChannelsAndMembers();
  }

  async function handleToggleMemberRole(member: MemberItem, role: ServerRoleOption, assigned: boolean) {
    if (!activeServerId) return;
    const { error } = await supabase.rpc("assign_server_member_role", {
      p_server_id: activeServerId,
      p_user_id: member.id,
      p_role_id: role.id,
      p_assign: !assigned,
    });
    if (error) {
      await dialogs.notify({
        title: "Não foi possível alterar o cargo",
        message: error.message.includes("assign_server_member_role")
          ? "Aplique db/platform_admin_server_management.sql no SQL Editor do Supabase depois das migrações indicadas no início do arquivo e tente novamente."
          : error.message,
      });
      return;
    }
    await loadChannelsAndMembers();
  }

  async function handleQuickDirectMessage(member: MemberItem, content: string) {
    if (!currentUserId || member.id === currentUserId) throw new Error("Não é possível enviar uma mensagem para a própria conta.");
    const { error } = await supabase.from("sekai_direct_messages").insert({
      sender_id: currentUserId,
      receiver_id: member.id,
      content: content.trim(),
    });
    if (error) throw new Error(error.message);
  }

  const currentMember = members.find((m) => m.id === currentUserId);
  const { messages, loading: isChannelLoading, sendMessage, toggleReaction, editMessage, deleteMessage } = useChannelMessages(
    activeChannelType === "text" ? activeChannelId : "",
    currentUserId ?? "",
    currentMember?.displayName ?? myProfile?.displayName ?? "Você",
    currentMember?.avatarUrl ?? myProfile?.avatarUrl ?? null,
  );

  async function joinVoiceChannel(channel: Channel) {
    setVoiceError("");
    setVoiceConnecting(true);
    const { data, error } = await supabase.auth.getSession();
    setVoiceConnecting(false);

    if (error || !data.session?.access_token) {
      setVoiceError("Sua sessão expirou. Saia e entre novamente no Sekai.");
      return;
    }

    // O `key` do RoomClient muda com o canal: trocar de canal encerra a chamada anterior.
    setVoiceSession({
      channelId: channel.id,
      channelName: channel.name,
      accessToken: data.session.access_token,
    });
    setCallExpanded(true);
  }

  function disconnectVoice() {
    setVoiceSession(null);
    setCallExpanded(false);
    setVoiceParticipants([]);
    voiceControlsRef.current = null;
    setVoiceControlState({ micOn: true, deafened: false, isSpeaking: false });
  }

  // Um clique entra diretamente na tela da chamada dentro da mesma aba.
  function handleSelectChannel(id: string) {
    const channel = channels.find((c) => c.id === id);
    if (!channel) return;

    setActiveChannelId(id);
    setActiveChannelType(channel.type);

    if (channel.type !== "voice") {
      setCallExpanded(false);
      return;
    }

    if (voiceSession?.channelId === id) {
      setCallExpanded(true);
      return;
    }

    void joinVoiceChannel(channel);
  }

  async function handleSubmitCreateServer(name: string, iconFile: File | null) {
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from("servers")
      .insert({ name, owner_id: currentUserId })
      .select("id, name, icon_url")
      .single();
    if (error) throw new Error(error.message);

    if (data && iconFile) {
      const extension = iconFile.name.split(".").pop()?.toLowerCase();
      const ext = extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : "png";
      const path = `${data.id}/icon-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("server-icons")
        .upload(path, iconFile, { upsert: true, contentType: iconFile.type });
      if (!uploadError) {
        const iconUrl = supabase.storage.from("server-icons").getPublicUrl(path).data.publicUrl;
        await supabase.from("servers").update({ icon_url: iconUrl }).eq("id", data.id);
      }
    }

    await loadServers();
    if (data) setActiveServerId(data.id);
  }

  async function handleSubmitJoinServer(rawCode: string) {
    // Aceita o código puro ou um link completo, preservando o parâmetro ?invite=.
    let code = rawCode.trim();
    try {
      const url = new URL(code, window.location.origin);
      code = url.searchParams.get("invite") || url.searchParams.get("code") || code;
      if (code === rawCode.trim() && url.pathname !== "/") {
        code = url.pathname.replace(/\/+$/, "").split("/").pop() || code;
      }
    } catch {
      // Entrada não é URL; é tratada como código direto abaixo.
    }
    code = code.trim();
    if (!code) throw new Error("Cole um código de convite.");

    const { data: serverId, error } = await supabase.rpc("redeem_invite", { p_code: code });
    if (error) throw new Error(error.message);
    if (serverId && currentUserId) {
      const { data: joinedServer } = await supabase.from("servers").select("id, name, icon_url").eq("id", serverId).maybeSingle();
      if (joinedServer) {
        const optimisticList = [...serversRef.current.filter((server) => server.id !== joinedServer.id), {
          id: joinedServer.id,
          name: joinedServer.name,
          iconUrl: joinedServer.icon_url,
        }];
        serversRef.current = optimisticList;
        setServers(optimisticList);
        try { window.localStorage.setItem(`sekai-server-list:${currentUserId}`, JSON.stringify(optimisticList)); } catch { /* Cache local opcional. */ }
      }
    }
    await loadServers();
    if (serverId) setActiveServerId(serverId as string);
  }

  async function handleSubmitCreateChannel(name: string, type: "text" | "voice", categoryId: string | null) {
    const { error } = await supabase.from("channels").insert({
      server_id: activeServerId,
      category_id: categoryId,
      name,
      type,
    });
    if (error) throw new Error(error.message);
    await loadChannelsAndMembers();
  }

  async function handleCreateCategory() {
    const name = await dialogs.prompt({
      title: "Criar categoria",
      label: "Nome da categoria",
      placeholder: "NOVA CATEGORIA",
      confirmLabel: "Criar categoria",
    });
    if (!name) return;

    const { error } = await supabase.from("channel_categories").insert({
      server_id: activeServerId,
      name: name.toUpperCase(),
      position: channels.length,
    });

    if (error) {
      await dialogs.notify({ title: "Não foi possível criar a categoria", message: error.message });
      return;
    }
    await loadChannelsAndMembers();
  }

  async function handleSend(content: string, attachmentUrl?: string | null) {
    if (content.startsWith("/") || /^\.troll(?:\s|$)/i.test(content)) {
      const result = await executeSlashCommand(content, {
        serverId: activeServerId,
        channelId: activeChannelId,
        currentUserId: currentUserId ?? "",
        resolveMentionToUserId: async (mention) => {
          const name = mention.replace("@", "");
          const found = members.find(
            (m) => m.displayName.toLowerCase() === name.toLowerCase()
          );
          return found?.id ?? null;
        },
      });
      if (!result.ok) console.warn(result.message);
      return;
    }
    try {
      if (activeServerId && content) {
        // Preferências são carregadas ao entrar no servidor. O banco continua
        // sendo a validação final para mensagens e modo lento via RLS.
        const settings = serverMessageSettingsCache.current.get(activeServerId) ?? {};
        if (settings.autoModEnabled) {
          const mentionLimit = Number(settings.mentionLimit ?? 0);
          const mentions = (content.match(/@/g) ?? []).length;
          if (mentionLimit > 0 && mentions > mentionLimit) {
            await dialogs.notify({ title: "Mensagem bloqueada pelo AutoMod", message: `Esta mensagem tem ${mentions} menções. O limite do servidor é ${mentionLimit}.` });
            return;
          }
          if (settings.blockInviteLinks && /(discord[.]gg|discord(app)?[.]com\/invite|https?:\/\/[^\s]+\/(invite|convite)\/)/i.test(content)) {
            await dialogs.notify({ title: "Convite externo bloqueado", message: "O AutoMod deste servidor não permite links de convite externos." });
            return;
          }
        }
        const slowmodeSeconds = Math.max(0, Number(settings.slowmodeSeconds ?? 0));
        if (slowmodeSeconds > 0) {
          const recent = [...messages].reverse().find((message) => message.authorId === currentUserId);
          if (recent?.createdAt) {
            const remaining = Math.ceil(slowmodeSeconds - (Date.now() - new Date(recent.createdAt).getTime()) / 1000);
            if (remaining > 0) { await dialogs.notify({ title: "Modo lento", message: `Aguarde ${remaining} segundo(s) antes de enviar outra mensagem.` }); return; }
          }
        }
      }
      await sendMessage(content, attachmentUrl);
    } catch (error) {
      await dialogs.notify({ title: "Não foi possível enviar", message: error instanceof Error ? error.message : "A mensagem foi recusada pelas regras do servidor." });
    }
  }

  async function uploadChannelImage(file: File): Promise<string> {
    if (!currentUserId || !activeChannelId) throw new Error("Selecione um canal de texto antes de enviar uma imagem.");
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `channels/${activeChannelId}/${currentUserId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("chat-images").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(`Falha ao enviar a imagem: ${error.message}`);
    return supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  if (!authChecked) return null;
  if (!currentUserId) return <LoginScreen />;

  const callOpenHere =
    callExpanded && !!voiceSession && activeChannelType === "voice" && activeChannelId === voiceSession.channelId;
  const connectedHere = !!voiceSession && voiceSession.channelId === activeChannelId;
  const liveVoiceMembers = voiceParticipants.map((participant) => ({ id: participant.id, name: participant.name, avatarUrl: participant.avatarUrl, isSpeaking: participant.isSpeaking }));
  const visibleVoiceMembersByChannel = voiceSession
    ? { ...voiceMembersByChannel, [voiceSession.channelId]: liveVoiceMembers }
    : voiceMembersByChannel;

  return (
    <div className="flex h-screen w-screen flex-col">
      <div className="h-[3px] w-full shrink-0 bg-theme-gradient" />
      <div className="flex min-h-0 flex-1">
      <ServerSidebar
        servers={servers}
        activeServerId={activeServerId}
        onSelectServer={handleSelectServer}
        onCreateServer={() => setShowCreateServer(true)}
        onOpenHome={() => { setActiveChannelId(""); setChannels([]); }}
        onServerContext={(serverId) => { handleSelectServer(serverId); setShowServerSettings(true); }}
      />

      {activeServerId ? <ChannelSidebar
        key={activeServerId}
        serverName={servers.find((s) => s.id === activeServerId)?.name ?? "Selecione um servidor"}
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={handleSelectChannel}
        canManageChannels={canManageChannels}
        onCreateChannel={(categoryId) => setCreateChannelCategoryId(categoryId)}
        onCreateCategory={handleCreateCategory}
        onDeleteChannel={async (channel) => {
          if (!await dialogs.confirm({ title: "Excluir canal", message: `Excluir #${channel.name}? Essa ação não pode ser desfeita.`, confirmLabel: "Excluir canal", danger: true })) return;
          const { error } = await supabase.from("channels").delete().eq("id", channel.id);
          if (error) { await dialogs.notify({ title: "Não foi possível excluir", message: error.message }); return; }
          if (activeChannelId === channel.id) setActiveChannelId("");
          await loadChannelsAndMembers();
        }}
        onOpenServerMenu={() => activeServerId && setShowServerSettings(true)}
        onOpenSettings={() => setShowUserSettings(true)}
        onToggleMute={voiceSession ? () => voiceControlsRef.current?.toggleMic() : undefined}
        onToggleDeafen={voiceSession ? () => voiceControlsRef.current?.toggleDeafen() : undefined}
        connectedVoiceChannelId={voiceSession?.channelId ?? null}
        connectedVoiceChannelName={voiceSession?.channelName}
        connectedVoiceMembers={liveVoiceMembers}
        voiceMembersByChannel={visibleVoiceMembersByChannel}
        onDisconnectVoice={disconnectVoice}
        currentUser={{
          userId: currentUserId,
          username: myProfile?.username,
          displayName: currentMember?.displayName ?? myProfile?.displayName ?? "Você",
          avatarUrl: currentMember?.avatarUrl ?? myProfile?.avatarUrl,
          avatarPositionX: currentMember?.avatarPositionX ?? myProfile?.avatarPositionX ?? 50,
          avatarPositionY: currentMember?.avatarPositionY ?? myProfile?.avatarPositionY ?? 50,
          avatarZoom: currentMember?.avatarZoom ?? myProfile?.avatarZoom ?? 100,
          bannerUrl: currentMember?.bannerUrl ?? myProfile?.bannerUrl,
          bannerPositionX: currentMember?.bannerPositionX ?? myProfile?.bannerPositionX ?? 50,
          bannerPositionY: currentMember?.bannerPositionY ?? myProfile?.bannerPositionY ?? 50,
          bannerZoom: currentMember?.bannerZoom ?? myProfile?.bannerZoom ?? 100,
          profileCardColor: myProfile?.profileCardColor,
          badges: myProfile?.badges ?? [],
          bio: myProfile?.bio,
          customStatus: myProfile?.customStatus,
          presence: myProfile?.presence ?? "online",
          isMuted: !voiceControlState.micOn,
          isDeafened: voiceControlState.deafened,
          isSpeaking: voiceControlState.isSpeaking,
        }}
        onPresenceChange={handlePresenceChange}
      /> : null}

      {showCreateServer && (
        <CreateServerModal
          onClose={() => setShowCreateServer(false)}
          onCreate={handleSubmitCreateServer}
          onJoin={handleSubmitJoinServer}
        />
      )}

      {createChannelCategoryId !== undefined && (
        <CreateChannelModal
          categories={Array.from(new Map(channels.map((c) => [c.categoryId, c.categoryName] as const)).entries())
            .filter(([id]) => id)
            .map(([id, name]) => ({ id: id as string, name: String(name) }))}
          defaultCategoryId={createChannelCategoryId}
          onClose={() => setCreateChannelCategoryId(undefined)}
          onCreate={handleSubmitCreateChannel}
        />
      )}

      {showUserSettings && currentUserId && (
        <UserSettingsModal
          userId={currentUserId}
          serverId={activeServerId}
          initial={myProfile ?? { displayName: currentMember?.displayName ?? "Você", username: currentMember?.username ?? "" }}
          members={members}
          onClose={() => setShowUserSettings(false)}
          onSaved={() => {
            loadMyProfile();
            loadChannelsAndMembers();
          }}
        />
      )}

      {showServerSettings && activeServerId && (
        <ServerSettingsModal
          serverId={activeServerId}
          serverName={servers.find((s) => s.id === activeServerId)?.name ?? ""}
          currentUserId={currentUserId ?? ""}
          isOwner={isOwner || isPlatformAdmin}
          perms={{
            manageGuild: isPlatformAdmin || hasPermission(myPermissions, "MANAGE_GUILD"),
            manageRoles: isPlatformAdmin || hasPermission(myPermissions, "MANAGE_ROLES"),
            manageChannels: isPlatformAdmin || hasPermission(myPermissions, "MANAGE_CHANNELS"),
            createInvite: isPlatformAdmin || hasPermission(myPermissions, "CREATE_INSTANT_INVITE"),
            kick: isPlatformAdmin || hasPermission(myPermissions, "KICK_MEMBERS"),
            ban: isPlatformAdmin || hasPermission(myPermissions, "BAN_MEMBERS"),
            viewAudit: isPlatformAdmin || hasPermission(myPermissions, "VIEW_AUDIT_LOG"),
          }}
          onClose={() => setShowServerSettings(false)}
          onDeleted={() => {
            setShowServerSettings(false);
            if (currentUserId) {
              serverChannelsCache.current.delete(channelCacheKey(currentUserId, activeServerId));
              try { window.localStorage.removeItem(`sekai-channels:${currentUserId}:${activeServerId}`); } catch { /* Cache local opcional. */ }
            }
            const remainingServers = serversRef.current.filter((server) => server.id !== activeServerId);
            serversRef.current = remainingServers;
            setServers(remainingServers);
            if (currentUserId) {
              try { window.localStorage.setItem(`sekai-server-list:${currentUserId}`, JSON.stringify(remainingServers)); } catch { /* Cache local opcional. */ }
            }
            setActiveServerId("");
            setActiveChannelId("");
            setChannels([]);
            setMembers([]);
            void loadServers();
          }}
          onChanged={() => {
            loadServers();
            loadChannelsAndMembers();
            serverMessageSettingsCache.current.delete(activeServerId);
            void supabase.from("server_preferences").select("settings").eq("server_id", activeServerId).maybeSingle().then(({ data, error }) => {
              if (!error) serverMessageSettingsCache.current.set(activeServerId, (data?.settings ?? {}) as ServerMessageSettings);
            });
          }}
        />
      )}

      {/* A chamada fica montada enquanto você está conectado; só aparece quando a tela dela está aberta. */}
      {voiceSession && (
        <div className={callOpenHere ? "call-host call-bg relative h-full min-w-0 flex-1 overflow-y-auto" : "hidden"}>
          <RoomClient
            key={voiceSession.channelId}
            roomId={voiceSession.channelId}
            roomName={voiceSession.channelName}
            initialName={currentMember?.displayName ?? "Você"}
            accessToken={voiceSession.accessToken}
            autoJoin
            onParticipantsChange={handleVoiceParticipantsChange}
            onControlsReady={handleVoiceControlsReady}
            onControlStateChange={handleVoiceControlStateChange}
            onAddFriend={handleAddFriend}
            onClose={disconnectVoice}
            onMinimize={() => setCallExpanded(false)}
          />
        </div>
      )}

      {callOpenHere ? null : !activeServerId ? (
        <FriendsHome
          currentUserId={currentUserId}
          servers={servers}
          openUserId={directMessageUserId}
          onDirectMessageOpened={() => setDirectMessageUserId(null)}
          unreadByUser={dmUnreadByUser}
          onlineUserIds={onlineUserIds}
          onMarkDirectRead={(userId) => setDmUnreadByUser((previous) => { const next = { ...previous }; delete next[userId]; return next; })}
          onOpenSettings={() => setShowUserSettings(true)}
          onPresenceChange={handlePresenceChange}
          currentUserProfile={{
            display_name: myProfile?.displayName ?? "Você",
            username: myProfile?.username,
            avatar_url: myProfile?.avatarUrl ?? null,
            avatar_position_x: myProfile?.avatarPositionX ?? 50,
            avatar_position_y: myProfile?.avatarPositionY ?? 50,
            avatar_zoom: myProfile?.avatarZoom ?? 100,
            banner_url: myProfile?.bannerUrl ?? null,
            banner_position_x: myProfile?.bannerPositionX ?? 50,
            banner_position_y: myProfile?.bannerPositionY ?? 50,
            banner_zoom: myProfile?.bannerZoom ?? 100,
            bio: myProfile?.bio ?? null,
            custom_status: myProfile?.customStatus ?? null,
            pronouns: myProfile?.pronouns ?? null,
            profile_card_color: myProfile?.profileCardColor ?? null,
            badges: myProfile?.badges ?? [],
            status: myProfile?.presence ?? "offline",
          }}
          onJoined={(serverId, channelId) => {
            if (channelId) setInviteVoiceChannelId(channelId);
            setActiveServerId(serverId);
          }}
        />
      ) : isServerLoading ? (
        <div role="status" className="server-view-enter flex min-h-0 min-w-0 flex-1 flex-col gap-4 bg-discord-bg-primary p-6">
          <span className="text-xs font-medium text-discord-text-muted">Carregando conversa…</span>
          <div className="max-w-3xl flex-1 animate-pulse space-y-3">
            <div className="h-12 w-2/3 rounded-xl bg-white/[0.035]" />
            <div className="h-8 w-1/2 rounded-lg bg-white/[0.025]" />
            <div className="h-24 w-full rounded-xl bg-white/[0.025]" />
          </div>
        </div>
      ) : !activeChannelId ? (
        <div className="server-view-enter flex min-w-0 flex-1 items-center justify-center bg-discord-bg-primary px-6 text-sm text-discord-text-muted">Este servidor ainda não tem um canal selecionado.</div>
      ) : activeChannelType === "voice" ? (
        <VoiceRoom
          channelName={activeChannel?.name ?? ""}
          connected={connectedHere}
          connecting={voiceConnecting}
          error={voiceError}
          onJoin={() => activeChannel && void joinVoiceChannel(activeChannel)}
          onOpenCall={() => setCallExpanded(true)}
          onDisconnect={disconnectVoice}
        />
      ) : (
        <ChatArea
          key={activeChannelId}
          channelName={activeChannel?.name ?? ""}
          messages={messages}
          loading={isChannelLoading}
          slashCommands={SLASH_COMMANDS}
          onSendMessage={handleSend}
          onUploadFile={uploadChannelImage}
          onToggleReaction={toggleReaction}
          currentUserId={currentUserId}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          canManageMessages={isOwner || isPlatformAdmin || hasPermission(myPermissions, "MANAGE_MESSAGES")}
          members={members}
          onAddFriend={handleAddFriend}
          onMessageMember={(member) => { setDirectMessageUserId(member.id); setActiveServerId(""); setActiveChannelId(""); }}
          onQuickMessageMember={handleQuickDirectMessage}
          mentionRequest={mentionRequest}
          onMentionHandled={(nonce) => setMentionRequest((current) => current?.nonce === nonce ? null : current)}
          canKickMembers={isOwner || isPlatformAdmin || hasPermission(myPermissions, "KICK_MEMBERS")}
          onKickMember={handleKickMember}
          roles={serverRoles}
          canManageRoles={isOwner || isPlatformAdmin || hasPermission(myPermissions, "MANAGE_ROLES")}
          canManageSelfRoles={isOwner || isPlatformAdmin}
          onToggleMemberRole={handleToggleMemberRole}
        />
      )}

      {!callOpenHere && !!activeServerId && <MemberList
        members={members}
        currentUserId={currentUserId}
        onAddFriend={handleAddFriend}
        canKick={isOwner || isPlatformAdmin || hasPermission(myPermissions, "KICK_MEMBERS")}
        canBan={isOwner || isPlatformAdmin || hasPermission(myPermissions, "BAN_MEMBERS")}
        canTimeout={isOwner || isPlatformAdmin || hasPermission(myPermissions, "MODERATE_MEMBERS") || hasPermission(myPermissions, "MUTE_MEMBERS")}
        canManageNicknames={isOwner || isPlatformAdmin || hasPermission(myPermissions, "MANAGE_NICKNAMES")}
        onKickMember={handleKickMember}
        onBanMember={handleBanMember}
        onTimeoutMember={handleTimeoutMember}
        onChangeNickname={handleChangeMemberNickname}
        onMentionMember={handleMentionMember}
        onMessageMember={(member) => { setDirectMessageUserId(member.id); setActiveServerId(""); setActiveChannelId(""); }}
        onQuickMessageMember={handleQuickDirectMessage}
        immediateMutualServer={servers.find((server) => server.id === activeServerId) ?? null}
        roles={serverRoles}
        canManageRoles={isOwner || isPlatformAdmin || hasPermission(myPermissions, "MANAGE_ROLES")}
        canManageSelfRoles={isOwner || isPlatformAdmin}
        onToggleRole={handleToggleMemberRole}
      />}
      {dmToast && <button onClick={() => { setDirectMessageUserId(dmToast.userId); setActiveServerId(""); setActiveChannelId(""); setCallExpanded(false); setDmToast(null); }} className="fixed bottom-5 left-5 z-[150] flex max-w-sm items-center gap-3 rounded-xl border border-white/10 bg-discord-bg-floating p-3 text-left shadow-2xl transition hover:bg-discord-bg-secondary">
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-discord-brand">{dmToast.avatarUrl ? <img src={dmToast.avatarUrl} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center font-bold text-white">{dmToast.name[0]?.toUpperCase()}</span>}<span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-discord-bg-floating bg-red-500"/></span>
        <span className="min-w-0"><span className="block text-xs font-semibold text-discord-text-muted">Nova mensagem direta</span><span className="block truncate text-sm font-semibold text-white">{dmToast.name}</span><span className="block truncate text-xs text-discord-text-muted">{dmToast.content}</span></span>
      </button>}
      </div>
    </div>
  );
}
