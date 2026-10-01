"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aggregateRolePermissions, hasPermission, PERMISSIONS, toBigInt } from "@/lib/permissions";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { ServerSettingsModal } from "@/components/ServerSettingsModal";
import { ServerSidebar, ServerItem } from "@/components/ServerSidebar";
import { ChannelSidebar, Channel } from "@/components/ChannelSidebar";
import { ChatArea } from "@/components/ChatArea";
import { VoiceRoom } from "@/components/VoiceRoom";
import RoomClient from "@/components/call/RoomClient";
import { MemberList, MemberItem } from "@/components/MemberList";
import { useChannelMessages } from "@/lib/chat/useChannelMessages";
import { executeSlashCommand, SLASH_COMMANDS } from "@/lib/commands/executeSlashCommand";

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
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [myProfile, setMyProfile] = useState<{ displayName: string; bio?: string | null; customStatus?: string | null; avatarUrl?: string | null } | null>(null);

  async function loadMyProfile() {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, username, bio, custom_status, avatar_url")
      .eq("id", currentUserId)
      .single();
    if (data) {
      setMyProfile({
        displayName: data.display_name || data.username,
        bio: data.bio,
        customStatus: data.custom_status,
        avatarUrl: data.avatar_url,
      });
    }
  }

  useEffect(() => {
    loadMyProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const requestedChannelId = new URLSearchParams(window.location.search).get("voiceChannel");
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
      .select("user_id, profiles(display_name, username, avatar_url, status)")
      .eq("server_id", activeServerId);

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
        displayName: m.profiles?.display_name || m.profiles?.username || "Usuário",
        avatarUrl: m.profiles?.avatar_url,
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

  const canManageChannels = isOwner || hasPermission(myPermissions, "MANAGE_CHANNELS");

  const { messages, sendMessage, toggleReaction } = useChannelMessages(
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
    setCallExpanded(false);
  }

  function disconnectVoice() {
    setVoiceSession(null);
    setCallExpanded(false);
  }

  // Um clique entra na chamada; o segundo clique no mesmo canal abre a tela da chamada,
  // sempre na mesma aba e no mesmo endereço.
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

    setCallExpanded(false);
    void joinVoiceChannel(channel);
  }

  async function handleCreateOrJoinServer() {
    const wantsToCreate = window.confirm(
      "OK = Criar um novo servidor\nCancelar = Entrar com um código de convite"
    );

    if (wantsToCreate) {
      const name = window.prompt("Nome do novo servidor:");
      if (!name?.trim() || !currentUserId) return;

      const { data, error } = await supabase
        .from("servers")
        .insert({ name: name.trim(), owner_id: currentUserId })
        .select("id, name, icon_url")
        .single();

      if (error) {
        alert("Não foi possível criar o servidor: " + error.message);
        return;
      }
      await loadServers();
      if (data) setActiveServerId(data.id);
      return;
    }

    const code = window.prompt("Código do convite:");
    if (!code?.trim()) return;

    const { data: serverId, error } = await supabase.rpc("redeem_invite", { p_code: code.trim() });
    if (error) {
      alert("Convite inválido: " + error.message);
      return;
    }
    await loadServers();
    if (serverId) setActiveServerId(serverId as string);
  }

  async function handleCreateChannel(categoryId: string | null, type: "text" | "voice") {
    const name = window.prompt(`Nome do novo canal de ${type === "text" ? "texto" : "voz"}:`);
    if (!name?.trim()) return;

    const { error } = await supabase.from("channels").insert({
      server_id: activeServerId,
      category_id: categoryId,
      name: name.trim().toLowerCase().replace(/\s+/g, "-"),
      type,
    });

    if (error) {
      alert("Não foi possível criar o canal: " + error.message);
      return;
    }
    await loadChannelsAndMembers();
  }

  async function handleCreateCategory() {
    const name = window.prompt("Nome da nova categoria:");
    if (!name?.trim()) return;

    const { error } = await supabase.from("channel_categories").insert({
      server_id: activeServerId,
      name: name.trim().toUpperCase(),
      position: channels.length,
    });

    if (error) {
      alert("Não foi possível criar a categoria: " + error.message);
      return;
    }
    await loadChannelsAndMembers();
  }

  async function handleSend(content: string) {
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
    sendMessage(content);
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
        onCreateServer={handleCreateOrJoinServer}
      />

      <ChannelSidebar
        serverName={servers.find((s) => s.id === activeServerId)?.name ?? "Selecione um servidor"}
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={handleSelectChannel}
        canManageChannels={canManageChannels}
        onCreateChannel={handleCreateChannel}
        onCreateCategory={handleCreateCategory}
        onOpenServerMenu={() => activeServerId && setShowServerSettings(true)}
        onOpenSettings={() => setShowUserSettings(true)}
        connectedVoiceChannelId={voiceSession?.channelId ?? null}
        connectedVoiceChannelName={voiceSession?.channelName}
        onDisconnectVoice={disconnectVoice}
        currentUser={{
          displayName: currentMember?.displayName ?? "Você",
          avatarUrl: currentMember?.avatarUrl,
        }}
      />

      {showUserSettings && currentUserId && myProfile && (
        <UserSettingsModal
          userId={currentUserId}
          initial={myProfile}
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
            onClose={disconnectVoice}
            onMinimize={() => setCallExpanded(false)}
          />
        </div>
      )}

      {callOpenHere ? null : !activeServerId ? (
        <div className="flex flex-1 items-center justify-center text-discord-text-muted">
          Crie ou selecione um servidor no menu à esquerda para começar.
        </div>
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
          onToggleReaction={toggleReaction}
        />
      )}

      {!callOpenHere && <MemberList members={members} />}
      </div>
    </div>
  );
}
