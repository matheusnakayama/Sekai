"use client";

import { useCallback, useEffect, useState } from "react";
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
import { MemberList, MemberItem } from "@/components/MemberList";
import { mapUserBadgeRows, type CustomBadge } from "@/lib/badges";
import { useChannelMessages } from "@/lib/chat/useChannelMessages";
import { executeSlashCommand, SLASH_COMMANDS } from "@/lib/commands/executeSlashCommand";
import { FriendsHome } from "@/components/FriendsHome";
import type { Participant } from "@/lib/types";

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
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [myPermissions, setMyPermissions] = useState<bigint>(0n);
  const [isOwner, setIsOwner] = useState(false);
  const [activeServerId, setActiveServerId] = useState<string>("");
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const [activeChannelType, setActiveChannelType] = useState<"text" | "voice">("text");
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
  const [myProfile, setMyProfile] = useState<{ displayName: string; username?: string; pronouns?: string | null; bio?: string | null; customStatus?: string | null; avatarUrl?: string | null; bannerUrl?: string | null; profileCardColor?: string | null; badges?: CustomBadge[]; presence?: "online" | "idle" | "dnd" | "offline" | null } | null>(null);

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
      .select("display_name, username, pronouns, bio, custom_status, avatar_url, banner_url, profile_card_color, status")
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
        bannerUrl: data.banner_url,
        profileCardColor: data.profile_card_color,
        badges,
        presence: data.status,
      });
    }
  }

  async function handlePresenceChange(presence: "online" | "idle" | "dnd" | "offline") {
    if (!currentUserId) return;
    const { error } = await supabase.from("profiles").update({ status: presence }).eq("id", currentUserId);
    if (error) return;
    setMyProfile((profile) => profile ? { ...profile, presence } : profile);
    await loadChannelsAndMembers();
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
      status: onlineIds.has(member.id) ? "online" : "offline",
    })));
  }, [onlineUserIds]);

  async function loadServers() {
    if (!currentUserId) return [];
    const { data } = await supabase
      .from("members")
      .select("servers(id, name, icon_url)")
      .eq("user_id", currentUserId);

    const list = (data ?? [])
      .map((row: any) => row.servers)
      .filter(Boolean)
      .map((s: any) => ({ id: s.id, name: s.name, iconUrl: s.icon_url }));
    setServers(list);
    return list;
  }

  useEffect(() => {
    if (!currentUserId) return;
    async function openRequestedChannelOrDefaultServer() {
      const list = await loadServers();
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get("invite");
      if (inviteCode) {
        const { data: joinedServerId, error } = await supabase.rpc("redeem_invite", { p_code: inviteCode });
        if (!error && joinedServerId) {
          const requestedChannelId = params.get("voiceChannel");
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

  async function loadChannelsAndMembers() {
    if (!activeServerId) return;

    // Dono? (bypassa toda checagem de permissão)
    const { data: serverRow } = await supabase
      .from("servers")
      .select("owner_id")
      .eq("id", activeServerId)
      .single();
    setIsOwner(serverRow?.owner_id === currentUserId);

    // Categorias + canais
    const { data: categories } = await supabase
      .from("channel_categories")
      .select("id, name, position")
      .eq("server_id", activeServerId)
      .order("position");

    const categoryNameById = new Map((categories ?? []).map((c: any) => [c.id, c.name]));

    const { data: channelRows } = await supabase
      .from("channels")
      .select("id, name, type, category_id, position")
      .eq("server_id", activeServerId)
      .order("position");

    const mappedChannels: Channel[] = (channelRows ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      categoryId: c.category_id,
      categoryName: categoryNameById.get(c.category_id) ?? "SEM CATEGORIA",
    }));
    setChannels(mappedChannels);

    const invitedChannel = inviteVoiceChannelId
      ? mappedChannels.find((channel) => channel.id === inviteVoiceChannelId && channel.type === "voice")
      : undefined;
    if (invitedChannel) {
      setActiveChannelId(invitedChannel.id);
      setActiveChannelType("voice");
      setInviteVoiceChannelId(null);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (mappedChannels[0] && !mappedChannels.some((c) => c.id === activeChannelId)) {
      setActiveChannelId(mappedChannels[0].id);
      setActiveChannelType(mappedChannels[0].type);
    }

    // Membros + cargos (um membro pode ter vários cargos agora)
    const { data: memberRows } = await supabase
      .from("members")
      .select("user_id, nickname, avatar_url, banner_url, profiles(display_name, username, pronouns, bio, custom_status, avatar_url, banner_url, profile_card_color, status)")
      .eq("server_id", activeServerId);

    const memberUserIds = [...new Set((memberRows ?? []).map((member: any) => member.user_id).filter(Boolean))];
    const { data: badgeRows } = memberUserIds.length
      ? await supabase
          .from("user_badges")
          .select("user_id, custom_badges(id, name, icon, background_color, foreground_color, image_url)")
          .in("user_id", memberUserIds)
      : { data: [] };
    const badgesByUser = mapUserBadgeRows(badgeRows);

    const { data: memberRoleRows } = await supabase
      .from("member_roles")
      .select("user_id, roles(id, name, color, position, permissions)")
      .eq("server_id", activeServerId);

    const rolesByUser = new Map<string, any[]>();
    (memberRoleRows ?? []).forEach((row: any) => {
      const list = rolesByUser.get(row.user_id) ?? [];
      if (row.roles) list.push(row.roles);
      rolesByUser.set(row.user_id, list);
    });

    const list: MemberItem[] = (memberRows ?? []).map((m: any) => {
      const roles = rolesByUser.get(m.user_id) ?? [];
      const topRole = [...roles].sort((a, b) => b.position - a.position)[0];
      return {
        id: m.user_id,
        displayName: m.nickname || m.profiles?.display_name || m.profiles?.username || "Usuário",
        username: m.profiles?.username,
        pronouns: m.profiles?.pronouns,
        bio: m.profiles?.bio,
        customStatus: m.profiles?.custom_status,
        avatarUrl: m.avatar_url || m.profiles?.avatar_url,
        bannerUrl: m.banner_url || m.profiles?.banner_url,
        profileCardColor: m.profiles?.profile_card_color,
        badges: badgesByUser.get(m.user_id) ?? [],
        status: m.profiles?.status ?? "offline",
        roleName: topRole?.name ?? "Membro",
        roleColor: topRole?.color,
      };
    });
    setMembers(list);

    const myRoles = rolesByUser.get(currentUserId ?? "") ?? [];
    setMyPermissions(aggregateRolePermissions(myRoles.map((r) => r.permissions)));
  }

  useEffect(() => {
    loadChannelsAndMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId, currentUserId]);

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

  const canManageChannels = isOwner || hasPermission(myPermissions, "MANAGE_CHANNELS");

  const handleVoiceParticipantsChange = useCallback((participants: Participant[]) => {
    setVoiceParticipants(participants);
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

  async function handleKickMember(member: MemberItem) {
    if (!activeServerId || member.id === currentUserId) return;
    const ok = await dialogs.confirm({ title: "Expulsar membro", message: `Expulsar ${member.displayName} deste servidor? Ele poderá voltar com um convite.`, confirmLabel: "Expulsar", danger: true });
    if (!ok) return;
    const { error } = await supabase.from("members").delete().match({ server_id: activeServerId, user_id: member.id });
    if (error) { await dialogs.notify({ title: "Não foi possível expulsar", message: error.message }); return; }
    await loadChannelsAndMembers();
  }

  const { messages, sendMessage, toggleReaction, editMessage, deleteMessage } = useChannelMessages(
    activeChannelType === "text" ? activeChannelId : "",
    currentUserId ?? ""
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
    if (content.startsWith("/")) {
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
    await sendMessage(content, attachmentUrl);
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
  const currentMember = members.find((m) => m.id === currentUserId);

  if (!authChecked) return null;
  if (!currentUserId) return <LoginScreen />;

  const callOpenHere =
    callExpanded && !!voiceSession && activeChannelType === "voice" && activeChannelId === voiceSession.channelId;
  const connectedHere = !!voiceSession && voiceSession.channelId === activeChannelId;

  return (
    <div className="flex h-screen w-screen flex-col">
      <div className="h-[3px] w-full shrink-0 bg-theme-gradient" />
      <div className="flex min-h-0 flex-1">
      <ServerSidebar
        servers={servers}
        activeServerId={activeServerId}
        onSelectServer={setActiveServerId}
        onCreateServer={() => setShowCreateServer(true)}
        onOpenHome={() => { setActiveChannelId(""); setChannels([]); }}
        onServerContext={(serverId) => { setActiveServerId(serverId); setShowServerSettings(true); }}
      />

      {activeServerId ? <ChannelSidebar
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
        connectedVoiceChannelId={voiceSession?.channelId ?? null}
        connectedVoiceChannelName={voiceSession?.channelName}
        voiceMembersByChannel={voiceMembersByChannel}
        onDisconnectVoice={disconnectVoice}
        currentUser={{
          userId: currentUserId,
          username: myProfile?.username,
          displayName: currentMember?.displayName ?? "Você",
          avatarUrl: currentMember?.avatarUrl ?? myProfile?.avatarUrl,
          bannerUrl: currentMember?.bannerUrl ?? myProfile?.bannerUrl,
          profileCardColor: myProfile?.profileCardColor,
          badges: myProfile?.badges,
          bio: myProfile?.bio,
          customStatus: myProfile?.customStatus,
          presence: myProfile?.presence ?? "online",
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
          isOwner={isOwner}
          perms={{
            manageGuild: hasPermission(myPermissions, "MANAGE_GUILD"),
            manageRoles: hasPermission(myPermissions, "MANAGE_ROLES"),
            manageChannels: hasPermission(myPermissions, "MANAGE_CHANNELS"),
            createInvite: hasPermission(myPermissions, "CREATE_INSTANT_INVITE"),
            kick: hasPermission(myPermissions, "KICK_MEMBERS"),
            ban: hasPermission(myPermissions, "BAN_MEMBERS"),
          }}
          onClose={() => setShowServerSettings(false)}
          onDeleted={() => {
            setShowServerSettings(false);
            setActiveServerId("");
            setActiveChannelId("");
            setChannels([]);
            setMembers([]);
            void loadServers();
          }}
          onChanged={() => {
            loadServers();
            loadChannelsAndMembers();
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
          onJoined={(serverId, channelId) => {
            if (channelId) setInviteVoiceChannelId(channelId);
            setActiveServerId(serverId);
          }}
        />
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
          channelName={activeChannel?.name ?? ""}
          messages={messages}
          slashCommands={SLASH_COMMANDS}
          onSendMessage={handleSend}
          onUploadFile={uploadChannelImage}
          onToggleReaction={toggleReaction}
          currentUserId={currentUserId}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          canManageMessages={isOwner || hasPermission(myPermissions, "MANAGE_MESSAGES")}
          members={members}
          onAddFriend={handleAddFriend}
          onMessageMember={(member) => { setDirectMessageUserId(member.id); setActiveServerId(""); setActiveChannelId(""); }}
        />
      )}

      {!callOpenHere && !!activeServerId && <MemberList
        members={members}
        currentUserId={currentUserId}
        onAddFriend={handleAddFriend}
        canKick={isOwner || hasPermission(myPermissions, "KICK_MEMBERS")}
        onKickMember={handleKickMember}
        onMessageMember={(member) => { setDirectMessageUserId(member.id); setActiveServerId(""); setActiveChannelId(""); }}
      />}
      {dmToast && <button onClick={() => { setDirectMessageUserId(dmToast.userId); setActiveServerId(""); setActiveChannelId(""); setCallExpanded(false); setDmToast(null); }} className="fixed bottom-5 left-5 z-[150] flex max-w-sm items-center gap-3 rounded-xl border border-white/10 bg-discord-bg-floating p-3 text-left shadow-2xl transition hover:bg-discord-bg-secondary">
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-discord-brand">{dmToast.avatarUrl ? <img src={dmToast.avatarUrl} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center font-bold text-white">{dmToast.name[0]?.toUpperCase()}</span>}<span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-discord-bg-floating bg-red-500"/></span>
        <span className="min-w-0"><span className="block text-xs font-semibold text-discord-text-muted">Nova mensagem direta</span><span className="block truncate text-sm font-semibold text-white">{dmToast.name}</span><span className="block truncate text-xs text-discord-text-muted">{dmToast.content}</span></span>
      </button>}
      </div>
    </div>
  );
}
