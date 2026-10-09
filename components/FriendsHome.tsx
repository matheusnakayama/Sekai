"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Send, UserPlus, Users, MessageCircle, Search, Inbox, ArrowLeft, Image as ImageIcon, UserRound, X, Smile, Settings, Phone, PhoneCall, Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resolveChatImageUrl } from "@/lib/chatImageUrls";
import { useDialogs } from "@/components/DialogProvider";
import { HoverGifImage } from "@/components/HoverGifImage";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { CroppedProfileImage, ProfileBanner } from "@/components/ProfileBanner";
import { getProfileCardPosition, UserProfileCard } from "@/components/UserProfileCard";
import type { ProfileCardPosition, ProfileCardUser } from "@/components/UserProfileCard";
import { mapUserBadgeRows, type CustomBadge } from "@/lib/badges";
import { PresenceIndicator, type Presence } from "@/components/PresenceIndicator";
import { CurrentUserProfileMenu } from "@/components/CurrentUserProfileMenu";
import { DIRECT_CALL_INVITE } from "@/lib/directCalls";
import { ChatMessageBody } from "@/components/ChatMessageBody";
import { NowPlayingCard, useNowPlaying } from "@/components/NowPlayingCard";
import { useChatDisplay } from "@/lib/chatPreferences";

interface FriendHomeProps {
  currentUserId: string;
  servers: { id: string; name: string }[];
  onJoined: (serverId: string, channelId: string | null) => void;
  openUserId?: string | null;
  onDirectMessageOpened?: () => void;
  unreadByUser?: Record<string, number>;
  onMarkDirectRead?: (userId: string) => void;
  onOpenSettings?: () => void;
  onOpenMobileNavigation?: () => void;
  onPresenceChange?: (presence: Presence) => boolean | void | Promise<boolean | void>;
  onlineUserIds?: string[];
  onJoinDirectCall?: (peerId: string, peerName: string, sendInvite: boolean) => void;
  activeDirectCallPeerId?: string | null;
  onOpenDirectCall?: () => void;
  currentUserProfile?: { display_name?: string | null; username?: string; avatar_url?: string | null; avatar_position_x?: number | null; avatar_position_y?: number | null; avatar_zoom?: number | null; banner_url?: string | null; banner_position_x?: number | null; banner_position_y?: number | null; banner_zoom?: number | null; bio?: string | null; custom_status?: string | null; pronouns?: string | null; profile_card_color?: string | null; badges?: CustomBadge[]; status?: string | null };
}

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; avatar_position_x?: number | null; avatar_position_y?: number | null; avatar_zoom?: number | null; status: string | null; banner_url?: string | null; banner_position_x?: number | null; banner_position_y?: number | null; banner_zoom?: number | null; bio?: string | null; custom_status?: string | null; pronouns?: string | null; profile_card_color?: string | null; badges?: CustomBadge[] };
type Friendship = { id: string; sender_id: string; receiver_id: string; status: "pending" | "accepted"; sender?: Profile; receiver?: Profile };
type ServerInvite = { id: string; sender_id: string; server_id: string; server_name: string; channel_id: string | null; status: "pending" | "accepted"; sender?: Profile };
type DirectMessage = { id: string; sender_id: string; receiver_id: string; content: string; attachment_url: string | null; created_at: string };

function explainDatabaseError(error: { code?: string; message: string }, feature: "friends" | "messages") {
  const migration = feature === "friends" ? "db/social_invites_migration.sql" : "db/direct_messages_migration.sql";
  if (["42P01", "PGRST205", "PGRST200"].includes(error.code ?? "")) {
    return `A tabela ou relação necessária não foi encontrada. Execute ${migration} no SQL Editor do Supabase. Detalhe: ${error.message}`;
  }
  if (error.code === "42501") {
    return `O Supabase bloqueou a operação por uma policy de segurança (RLS). Execute novamente ${migration} e confira se está usando a sessão autenticada correta. Detalhe: ${error.message}`;
  }
  if (error.code === "23505") return "Já existe uma solicitação de amizade ou vocês já são amigos.";
  return `Erro do Supabase${error.code ? ` (${error.code})` : ""}: ${error.message}`;
}

export function FriendsHome({ currentUserId, servers, onJoined, openUserId, onDirectMessageOpened, unreadByUser = {}, onMarkDirectRead, onOpenSettings, onOpenMobileNavigation, onPresenceChange, onlineUserIds = [], currentUserProfile, onJoinDirectCall, activeDirectCallPeerId, onOpenDirectCall }: FriendHomeProps) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [username, setUsername] = useState("");
  const [requests, setRequests] = useState<Friendship[]>([]);
  const [serverInvites, setServerInvites] = useState<ServerInvite[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverByFriend, setServerByFriend] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"online" | "all" | "pending">("online");
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null);
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [signedDmImageUrls, setSignedDmImageUrls] = useState<Record<string, string>>({});
  const signedDmImageCache = useRef(new Map<string, string>());
  const [dmDraft, setDmDraft] = useState("");
  const chatDisplay = useChatDisplay(currentUserId);
  const [recentProfiles, setRecentProfiles] = useState<Profile[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(true);
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [hoveredDmProfileId, setHoveredDmProfileId] = useState<string | null>(null);
  const [miniProfile, setMiniProfile] = useState<{ profile: ProfileCardUser; position: ProfileCardPosition } | null>(null);
  const [selfProfileMenuRequest, setSelfProfileMenuRequest] = useState(0);
  const dmScrollRef = useRef<HTMLDivElement>(null);
  const dmWasAtBottom = useRef(true);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const syncProfilePanel = () => setProfilePanelOpen(desktop.matches);
    syncProfilePanel();
    desktop.addEventListener("change", syncProfilePanel);
    return () => desktop.removeEventListener("change", syncProfilePanel);
  }, []);

  const loadFriends = useCallback(async () => {
    const [{ data, error }, { data: inviteRows }] = await Promise.all([
      supabase.from("friendships")
      .select("id,sender_id,receiver_id,status,sender:profiles!friendships_sender_id_fkey(id,username,display_name,avatar_url,avatar_position_x,avatar_position_y,avatar_zoom,status,banner_url,banner_position_x,banner_position_y,banner_zoom,bio,custom_status,pronouns,profile_card_color),receiver:profiles!friendships_receiver_id_fkey(id,username,display_name,avatar_url,avatar_position_x,avatar_position_y,avatar_zoom,status,banner_url,banner_position_x,banner_position_y,banner_zoom,bio,custom_status,pronouns,profile_card_color)")
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .order("created_at", { ascending: false }),
      supabase.from("friend_server_invites")
        .select("id,sender_id,server_id,server_name,channel_id,status,sender:profiles!friend_server_invites_sender_id_fkey(id,username,display_name,avatar_url,status)")
        .eq("receiver_id", currentUserId).eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    if (error) { setMessage(explainDatabaseError(error, "friends")); return; }
    setRequests((data ?? []) as unknown as Friendship[]);
    setServerInvites((inviteRows ?? []) as unknown as ServerInvite[]);
  }, [currentUserId, supabase]);

  useEffect(() => { void loadFriends(); }, [loadFriends]);
  useEffect(() => {
    const channel = supabase.channel(`friend-invites:${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_server_invites", filter: `receiver_id=eq.${currentUserId}` }, () => void loadFriends())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `receiver_id=eq.${currentUserId}` }, () => void loadFriends())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `sender_id=eq.${currentUserId}` }, () => void loadFriends())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, loadFriends, supabase]);

  const friends = useMemo(() => requests.filter((item) => item.status === "accepted"), [requests]);
  const incoming = useMemo(() => requests.filter((item) => item.status === "pending" && item.receiver_id === currentUserId), [requests, currentUserId]);
  const outgoing = useMemo(() => requests.filter((item) => item.status === "pending" && item.sender_id === currentUserId), [requests, currentUserId]);
  const friendProfiles = useMemo(() => friends.map((item) => item.sender_id === currentUserId ? item.receiver : item.sender).filter((profile): profile is Profile => !!profile), [friends, currentUserId]);
  const conversationProfiles = useMemo(() => {
    const profiles = new Map<string, Profile>();
    [...recentProfiles, ...friendProfiles].forEach((profile) => profiles.set(profile.id, profile));
    if (selectedFriend) profiles.set(selectedFriend.id, selectedFriend);
    return Array.from(profiles.values());
  }, [friendProfiles, recentProfiles, selectedFriend]);

  const loadRecentProfiles = useCallback(async () => {
    const { data } = await supabase.from("sekai_direct_messages").select("sender_id,receiver_id,created_at")
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`).order("created_at", { ascending: false }).limit(100);
    const ids = Array.from(new Set((data ?? []).map((row) => row.sender_id === currentUserId ? row.receiver_id : row.sender_id))).filter((id) => id !== currentUserId);
    if (!ids.length) { setRecentProfiles([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("id,username,display_name,avatar_url,avatar_position_x,avatar_position_y,avatar_zoom,status,banner_url,banner_position_x,banner_position_y,banner_zoom,bio,custom_status,pronouns,profile_card_color").in("id", ids);
    setRecentProfiles((profiles ?? []) as Profile[]);
  }, [currentUserId, supabase]);

  useEffect(() => { void loadRecentProfiles(); }, [loadRecentProfiles]);
  useEffect(() => {
    const channel = supabase.channel(`dm-list:${currentUserId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "sekai_direct_messages" }, () => void loadRecentProfiles()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, loadRecentProfiles, supabase]);

  useEffect(() => {
    if (!openUserId) return;
    const knownFriend = friendProfiles.find((profile) => profile.id === openUserId);
    if (knownFriend) {
      setSelectedFriend(knownFriend);
      onMarkDirectRead?.(knownFriend.id);
      onDirectMessageOpened?.();
      return;
    }
    let cancelled = false;
    void supabase.from("profiles").select("id,username,display_name,avatar_url,avatar_position_x,avatar_position_y,avatar_zoom,status,banner_url,banner_position_x,banner_position_y,banner_zoom,bio,custom_status,pronouns,profile_card_color").eq("id", openUserId).maybeSingle().then(({ data }) => {
      if (!cancelled && data) { setSelectedFriend(data as Profile); onMarkDirectRead?.(data.id); }
      onDirectMessageOpened?.();
    });
    return () => { cancelled = true; };
  }, [friendProfiles, onDirectMessageOpened, onMarkDirectRead, openUserId, supabase]);

  const loadDm = useCallback(async () => {
    if (!selectedFriend) { setDmMessages([]); return; }
    const { data, error } = await supabase.from("sekai_direct_messages").select("id,sender_id,receiver_id,content,attachment_url,created_at")
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${selectedFriend.id}),and(sender_id.eq.${selectedFriend.id},receiver_id.eq.${currentUserId})`)
      .order("created_at", { ascending: true }).limit(100);
    if (error) { setMessage(explainDatabaseError(error, "messages")); return; }
    setDmMessages((data ?? []) as DirectMessage[]);
  }, [currentUserId, selectedFriend, supabase]);
  useEffect(() => { void loadDm(); }, [loadDm]);
  useEffect(() => {
    let cancelled = false;
    const urls = Array.from(new Set(dmMessages.map((item) => item.attachment_url).filter((url): url is string => !!url)));
    const unresolved = urls.filter((url) => !signedDmImageCache.current.has(url));
    if (!unresolved.length) {
      setSignedDmImageUrls(Object.fromEntries(urls.map((url) => [url, signedDmImageCache.current.get(url) ?? url])));
      return;
    }
    void Promise.all(unresolved.map(async (url) => [url, await resolveChatImageUrl(supabase, url)] as const)).then((entries) => {
      if (cancelled) return;
      entries.forEach(([url, signedUrl]) => signedDmImageCache.current.set(url, signedUrl));
      setSignedDmImageUrls(Object.fromEntries(urls.map((url) => [url, signedDmImageCache.current.get(url) ?? url])));
    });
    return () => { cancelled = true; };
  }, [dmMessages, supabase]);
  useEffect(() => {
    if (!selectedFriend || selectedFriend.badges) return;
    let cancelled = false;
    const profileId = selectedFriend.id;
    void supabase.from("user_badges")
      .select("user_id, custom_badges(id, name, icon, background_color, foreground_color, image_url)")
      .eq("user_id", profileId)
      .then(({ data }) => {
        if (cancelled) return;
        const badges = mapUserBadgeRows(data).get(profileId) ?? [];
        setSelectedFriend((current) => current?.id === profileId ? { ...current, badges } : current);
        setMiniProfile((current) => current?.profile.id === profileId ? { ...current, profile: { ...current.profile, badges } } : current);
      });
    return () => { cancelled = true; };
  }, [selectedFriend?.id, selectedFriend?.badges, supabase]);
  useEffect(() => {
    dmWasAtBottom.current = true;
  }, [selectedFriend?.id]);
  useEffect(() => {
    const element = dmScrollRef.current;
    const lastMessage = dmMessages[dmMessages.length - 1];
    const sentByCurrentUser = lastMessage?.sender_id === currentUserId;
    if (element && (dmWasAtBottom.current || sentByCurrentUser)) {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: document.documentElement.dataset.reducedMotion === "true" ? "auto" : "smooth",
      });
      dmWasAtBottom.current = true;
    }
  }, [currentUserId, dmMessages]);
  useEffect(() => {
    if (!selectedFriend) return;
    const channel = supabase.channel(`sekai-dm:${currentUserId}:${selectedFriend.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "sekai_direct_messages" }, (event) => {
      const row = event.new as DirectMessage;
      if ((row.sender_id === currentUserId && row.receiver_id === selectedFriend.id) || (row.sender_id === selectedFriend.id && row.receiver_id === currentUserId)) {
        setDmMessages((prev) => prev.some((message) => message.id === row.id) ? prev : [...prev, row]);
      }
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, selectedFriend, supabase]);

  async function sendDirectMessage(event: React.FormEvent) {
    event.preventDefault();
    const content = dmDraft.trim();
    if (!selectedFriend || !content) return;
    setMessage("");
    const { data, error } = await supabase.from("sekai_direct_messages").insert({ sender_id: currentUserId, receiver_id: selectedFriend.id, content }).select("id,sender_id,receiver_id,content,attachment_url,created_at").single();
    if (error) { setMessage(explainDatabaseError(error, "messages")); return; }
    if (data) setDmMessages((prev) => [...prev, data as DirectMessage]);
    setDmDraft("");
  }

  async function sendQuickDirectMessage(profile: ProfileCardUser, content: string) {
    if (profile.id === currentUserId) throw new Error("Não é possível enviar uma mensagem para a própria conta.");
    const { error } = await supabase.from("sekai_direct_messages").insert({
      sender_id: currentUserId,
      receiver_id: profile.id,
      content: content.trim(),
    });
    if (error) throw new Error(explainDatabaseError(error, "messages"));
  }

  async function uploadDmImage(file?: File) {
    if (!file || !selectedFriend) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setMessage("Escolha uma imagem de até 5 MB."); return; }
    setUploadingImage(true); setMessage("");
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `dm/${selectedFriend.id}/${currentUserId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("chat-images").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) { setMessage(`Falha no envio da imagem: ${uploadError.message}. Confira a migração de imagens no Supabase.`); setUploadingImage(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("chat-images").getPublicUrl(path);
    const { data, error } = await supabase.from("sekai_direct_messages").insert({ sender_id: currentUserId, receiver_id: selectedFriend.id, content: "", attachment_url: publicUrl }).select("id,sender_id,receiver_id,content,attachment_url,created_at").single();
    if (error) setMessage(explainDatabaseError(error, "messages"));
    else if (data) setDmMessages((prev) => [...prev, data as DirectMessage]);
    setUploadingImage(false);
  }

  function openConversation(profile: Profile) {
    setSelectedFriend(profile);
    onMarkDirectRead?.(profile.id);
  }

  function trackDmScroll() {
    const element = dmScrollRef.current;
    if (!element) return;
    dmWasAtBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  function isOnline(userId?: string) {
    return !!userId && onlineUserIds.includes(userId);
  }

  function resolvePresence(profile: Pick<Profile, "id" | "status">): Presence {
    if (!isOnline(profile.id)) return "offline";
    return profile.status === "idle" || profile.status === "dnd" ? profile.status : "online";
  }

  function withLivePresence(profile?: Profile) {
    return profile ? { ...profile, status: resolvePresence(profile) } : undefined;
  }

  const onlineConversations = useMemo(
    () => conversationProfiles.map((profile) => ({ ...profile, status: resolvePresence(profile) })),
    // Presence is a live list maintained by Supabase Realtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationProfiles, onlineUserIds]
  );
  const miniProfileContact = miniProfile ? conversationProfiles.find((profile) => profile.id === miniProfile.profile.id) : undefined;
  const visibleConversations = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return onlineConversations;
    return onlineConversations.filter((profile) => `${profile.display_name ?? ""} ${profile.username}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [conversationSearch, onlineConversations]);
  const visibleDmMessages = useMemo(() => {
    const query = messageSearch.trim().toLocaleLowerCase("pt-BR");
    return query ? dmMessages.filter((item) => item.content.toLocaleLowerCase("pt-BR").includes(query)) : dmMessages;
  }, [dmMessages, messageSearch]);
  const activeFriend = selectedFriend ? { ...selectedFriend, status: resolvePresence(selectedFriend) } : null;
  const friendActivity = useNowPlaying(activeFriend?.id ?? "", activeFriend?.status ?? "offline");

  function other(item: Friendship) { return item.sender_id === currentUserId ? item.receiver : item.sender; }

  async function addFriend(event: React.FormEvent) {
    event.preventDefault(); setMessage(""); setBusy(true);
    const name = username.trim().replace(/^@/, "");
    const { data: profile, error: lookupError } = await supabase.from("profiles").select("id").eq("username", name).maybeSingle();
    if (lookupError) { setMessage(`Falha ao consultar o perfil${lookupError.code ? ` (${lookupError.code})` : ""}: ${lookupError.message}`); setBusy(false); return; }
    if (!profile) { setMessage("Não encontramos esse nome de usuário."); setBusy(false); return; }
    if (profile.id === currentUserId) { setMessage("Você não pode adicionar a si mesmo."); setBusy(false); return; }
    const { error } = await supabase.from("friendships").insert({ sender_id: currentUserId, receiver_id: profile.id, status: "pending" });
    setBusy(false);
    if (error) { setMessage(explainDatabaseError(error, "friends")); return; }
    setUsername(""); setMessage("Solicitação enviada."); await loadFriends();
  }

  async function accept(id: string) {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    if (error) { setMessage("Não foi possível aceitar. Confira as policies da migração."); return; }
    await loadFriends();
  }

  async function inviteFriend(friend: Profile | undefined) {
    if (!friend) return;
    const serverId = serverByFriend[friend.id] || servers[0]?.id;
    if (!serverId) { setMessage("Crie ou entre em um servidor antes de convidar amigos."); return; }
    const { data: channel } = await supabase.from("channels").select("id").eq("server_id", serverId).eq("type", "voice").order("position").limit(1).maybeSingle();
    const { data: invite, error } = await supabase.from("invites").insert({ server_id: serverId, channel_id: channel?.id ?? null, inviter_id: currentUserId, max_uses: 0, max_age: 0 }).select("code").single();
    if (error || !invite) { setMessage("Não foi possível gerar o convite. Confira se a tabela de convites está configurada no Supabase."); return; }
    const { error: directInviteError } = await supabase.from("friend_server_invites").insert({ sender_id: currentUserId, receiver_id: friend.id, server_id: serverId, server_name: servers.find((server) => server.id === serverId)?.name || "Servidor", channel_id: channel?.id ?? null, invite_code: invite.code });
    const url = new URL(window.location.origin);
    url.searchParams.set("invite", invite.code);
    if (channel?.id) url.searchParams.set("voiceChannel", channel.id);
    try { await navigator.clipboard.writeText(url.toString()); }
    catch { await dialogs.notify({ title: "Convite criado", message: url.toString() }); return; }
    setMessage(directInviteError ? `Link de convite copiado para ${friend.display_name || friend.username}.` : `Convite enviado para ${friend.display_name || friend.username}; o link também foi copiado.`);
  }

  async function acceptServerInvite(invite: ServerInvite) {
    const { data: serverId, error } = await supabase.rpc("accept_friend_server_invite", { p_invite_id: invite.id });
    if (error || !serverId) { setMessage("Este convite expirou ou foi revogado."); return; }
    onJoined(serverId as string, invite.channel_id);
  }

  function openMiniProfile(profile: Profile, anchor: HTMLElement) {
    if (profile.id === currentUserId) {
      setMiniProfile(null);
      setSelfProfileMenuRequest((request) => request + 1);
      return;
    }
    const status = resolvePresence(profile);
    setMiniProfile({
      profile: {
        id: profile.id,
        displayName: profile.display_name || profile.username,
        username: profile.username,
        pronouns: profile.pronouns,
        bio: profile.bio,
        customStatus: profile.custom_status,
        avatarUrl: profile.avatar_url,
        avatarPositionX: profile.avatar_position_x,
        avatarPositionY: profile.avatar_position_y,
        avatarZoom: profile.avatar_zoom,
        bannerUrl: profile.banner_url,
        bannerPositionX: profile.banner_position_x,
        bannerPositionY: profile.banner_position_y,
        bannerZoom: profile.banner_zoom,
        profileCardColor: profile.profile_card_color,
        badges: profile.badges,
        status,
        roleName: "Membro",
      },
      position: getProfileCardPosition(anchor, true),
    });
  }

  function ownProfile(): Profile {
    return {
      id: currentUserId,
      username: currentUserProfile?.username || "voce",
      display_name: currentUserProfile?.display_name || "Você",
      avatar_url: currentUserProfile?.avatar_url ?? null,
      avatar_position_x: currentUserProfile?.avatar_position_x ?? 50,
      avatar_position_y: currentUserProfile?.avatar_position_y ?? 50,
      avatar_zoom: currentUserProfile?.avatar_zoom ?? 100,
      banner_url: currentUserProfile?.banner_url ?? null,
      banner_position_x: currentUserProfile?.banner_position_x ?? 50,
      banner_position_y: currentUserProfile?.banner_position_y ?? 50,
      banner_zoom: currentUserProfile?.banner_zoom ?? 100,
      bio: currentUserProfile?.bio ?? null,
      custom_status: currentUserProfile?.custom_status ?? null,
      pronouns: currentUserProfile?.pronouns ?? null,
      profile_card_color: currentUserProfile?.profile_card_color ?? null,
      badges: currentUserProfile?.badges ?? [],
      status: currentUserProfile?.status ?? "offline",
    };
  }

  return <div className="flex min-w-0 flex-1 overflow-hidden bg-discord-bg-primary">
    <aside className="hidden w-[270px] shrink-0 flex-col border-r border-black/20 bg-discord-bg-secondary/70 md:flex">
      <div className="p-3"><label className="flex w-full items-center gap-2 rounded-lg bg-discord-bg-primary/70 px-3 py-2 text-sm text-discord-text-muted transition focus-within:ring-1 focus-within:ring-white/20"><Search size={16}/><input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Buscar" aria-label="Buscar conversas" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-discord-text-muted" />{conversationSearch && <button type="button" onClick={() => setConversationSearch("")} aria-label="Limpar busca"><X size={14}/></button>}</label></div>
      <nav className="space-y-1 px-2">
        <button onClick={() => { setSelectedFriend(null); setTab("online"); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === "online" && !selectedFriend ? "bg-discord-bg-modifier-hover text-white" : "text-discord-text-muted hover:bg-discord-bg-modifier-hover/60"}`}><Users size={18}/>Amigos online</button>
        <button onClick={() => { setSelectedFriend(null); setTab("all"); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === "all" && !selectedFriend ? "bg-discord-bg-modifier-hover text-white" : "text-discord-text-muted hover:bg-discord-bg-modifier-hover/60"}`}><Users size={18}/>Todos</button>
        <button onClick={() => { setSelectedFriend(null); setTab("pending"); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === "pending" && !selectedFriend ? "bg-discord-bg-modifier-hover text-white" : "text-discord-text-muted hover:bg-discord-bg-modifier-hover/60"}`}><Inbox size={18}/>Solicitações {incoming.length > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">{incoming.length}</span>}</button>
      </nav>
      <div className="mx-3 my-4 border-t border-black/20"/>
      <div className="flex items-center justify-between px-4 pb-2 text-[11px] font-bold uppercase tracking-wide text-discord-text-muted">Mensagens diretas <button title="Adicionar amigo" onClick={() => { setSelectedFriend(null); setTab("all"); }}><UserPlus size={15}/></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">{visibleConversations.map((profile) => <button key={profile.id} onClick={() => openConversation(profile)} className={`relative flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${selectedFriend?.id === profile.id ? "bg-discord-bg-modifier-hover" : "hover:bg-discord-bg-modifier-hover/60"}`}><FriendAvatar profile={profile} size="sm" statusSurface="rgb(var(--d-secondary))"/><span className="truncate text-sm font-medium text-discord-text-normal">{profile.display_name || profile.username}</span>{!!unreadByUser[profile.id] && <span className="ml-auto min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[10px] font-bold text-white">{unreadByUser[profile.id]}</span>}</button>)}{!visibleConversations.length && <p className="px-3 py-5 text-xs text-discord-text-muted">{conversationSearch ? "Nenhuma conversa encontrada." : "Suas conversas diretas aparecerão aqui."}</p>}</div>
      <div className="mx-3 border-t border-white/[0.07]" />
      <CurrentUserProfileMenu
        openRequest={selfProfileMenuRequest}
        user={{
          userId: currentUserId,
          username: currentUserProfile?.username,
          displayName: currentUserProfile?.display_name || "Você",
          avatarUrl: currentUserProfile?.avatar_url,
          avatarPositionX: currentUserProfile?.avatar_position_x,
          avatarPositionY: currentUserProfile?.avatar_position_y,
          avatarZoom: currentUserProfile?.avatar_zoom,
          bannerUrl: currentUserProfile?.banner_url,
          bannerPositionX: currentUserProfile?.banner_position_x,
          bannerPositionY: currentUserProfile?.banner_position_y,
          bannerZoom: currentUserProfile?.banner_zoom,
          profileCardColor: currentUserProfile?.profile_card_color,
          badges: currentUserProfile?.badges,
          customStatus: currentUserProfile?.custom_status,
          presence: currentUserProfile?.status === "online" || currentUserProfile?.status === "idle" || currentUserProfile?.status === "dnd" || currentUserProfile?.status === "offline" ? currentUserProfile.status : "offline",
        }}
        onOpenSettings={onOpenSettings}
        onPresenceChange={onPresenceChange}
      >
        {({ toggle, openSettings, isOpen, triggerRef }) => <footer ref={triggerRef} className="flex h-[60px] shrink-0 items-center gap-2 bg-discord-bg-darkest px-2">
          <button type="button" onClick={toggle} aria-expanded={isOpen} aria-label="Abrir seu perfil" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-discord-bg-modifier-hover">
            <FriendAvatar profile={ownProfile()} size="sm" statusSurface="rgb(var(--d-darkest))" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-discord-header-primary">{currentUserProfile?.display_name || "Você"}</span><span className="block truncate text-xs text-discord-text-muted">{currentUserProfile?.custom_status || `@${currentUserProfile?.username || "voce"}`}</span></span>
          </button>
          <button type="button" onClick={openSettings} title="Configurações de usuário" aria-label="Abrir configurações de usuário" className="rounded-md p-2 text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-discord-text-normal"><Settings size={18}/></button>
        </footer>}
      </CurrentUserProfileMenu>
    </aside>
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {selectedFriend && activeFriend ? <div key={activeFriend.id} className="server-view-enter relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-black/20 px-2 shadow-sm sm:gap-3 sm:px-5">
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-discord-bg-modifier-hover text-discord-text-normal md:hidden" onClick={onOpenMobileNavigation} aria-label="Abrir servidores"><Menu size={20}/></button>
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-white md:hidden" onClick={() => setSelectedFriend(null)} aria-label="Voltar para amigos"><ArrowLeft size={20}/></button>
            <FriendIdentity profile={activeFriend} compact isHovered={hoveredDmProfileId === activeFriend.id} onHoverChange={(hovered) => setHoveredDmProfileId(hovered ? activeFriend.id : null)} onProfileClick={openMiniProfile}/>
            <span className="hidden border-l border-white/10 pl-3 text-xs text-discord-text-muted lg:block">Mensagem direta</span>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {messageSearchOpen && <input autoFocus value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Buscar na conversa" aria-label="Buscar mensagens desta conversa" className="w-36 rounded-md bg-discord-bg-secondary px-2.5 py-1.5 text-xs text-discord-text-normal outline-none focus:ring-1 focus:ring-white/20 sm:w-52"/>}
              {activeDirectCallPeerId === activeFriend.id
                ? <button onClick={onOpenDirectCall} title="Voltar para a chamada" aria-label="Voltar para a chamada" className="rounded p-2 text-discord-online hover:bg-discord-bg-modifier-hover"><PhoneCall size={18}/></button>
                : <button onClick={() => onJoinDirectCall?.(activeFriend.id, activeFriend.display_name || activeFriend.username, true)} title={`Ligar para ${activeFriend.display_name || activeFriend.username}`} aria-label={`Ligar para ${activeFriend.display_name || activeFriend.username}`} className="rounded p-2 text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-online"><Phone size={18}/></button>}
              <button onClick={() => { setMessageSearchOpen((open) => !open); if (messageSearchOpen) setMessageSearch(""); }} title="Buscar na conversa" aria-label="Buscar na conversa" className="rounded p-2 text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-white"><Search size={18}/></button>
              <button onClick={() => setProfilePanelOpen((open) => !open)} title={profilePanelOpen ? "Fechar perfil" : "Abrir perfil"} aria-label={profilePanelOpen ? "Fechar perfil" : "Abrir perfil"} className={`rounded p-2 transition hover:bg-discord-bg-modifier-hover hover:text-white ${profilePanelOpen ? "text-discord-header-primary" : "text-discord-text-muted"}`}><UserRound size={18}/></button>
              <button onClick={onOpenSettings} title="Configurações" aria-label="Abrir configurações" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-white"><Settings size={19}/></button>
            </div>
          </header>
          <div ref={dmScrollRef} onScroll={trackDmScroll} className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-6 sm:px-6">
            <div className="mb-7 border-b border-white/10 pb-6">
              <button type="button" onMouseEnter={() => setHoveredDmProfileId(activeFriend.id)} onMouseLeave={() => setHoveredDmProfileId((id) => id === activeFriend.id ? null : id)} onClick={(event) => openMiniProfile(activeFriend, event.currentTarget)} aria-label={`Abrir perfil de ${activeFriend.display_name || activeFriend.username}`} className="block rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand">
                <FriendAvatar profile={activeFriend} size="lg" isHovered={hoveredDmProfileId === activeFriend.id}/>
              </button>
              <h1 className="mt-3 text-2xl font-bold text-discord-header-primary"><button type="button" onMouseEnter={() => setHoveredDmProfileId(activeFriend.id)} onMouseLeave={() => setHoveredDmProfileId((id) => id === activeFriend.id ? null : id)} onClick={(event) => openMiniProfile(activeFriend, event.currentTarget)} className="rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand">{activeFriend.display_name || activeFriend.username}</button></h1>
              <p className="mt-1 text-sm text-discord-text-muted">@{activeFriend.username}</p>
              <p className="mt-2 text-sm text-discord-text-muted">Esta é sua conversa com <span className="font-medium text-discord-text-normal">{activeFriend.display_name || activeFriend.username}</span>.</p>
            </div>
            {visibleDmMessages.length ? <div className="space-y-1">
              {visibleDmMessages.map((item, index) => {
                const previous = visibleDmMessages[index - 1];
                const timestamp = new Date(item.created_at);
                const previousTimestamp = previous ? new Date(previous.created_at) : null;
                const showDate = !previous || timestamp.toDateString() !== previousTimestamp?.toDateString();
                const grouped = !!previous && previous.sender_id === item.sender_id && timestamp.getTime() - (previousTimestamp?.getTime() ?? 0) < 7 * 60 * 1000 && !showDate;
                const author = item.sender_id === currentUserId ? ownProfile() : activeFriend;
                return <div key={item.id}>
                  {showDate && <div className="my-5 flex items-center gap-3 text-[11px] font-semibold text-discord-text-muted"><span className="h-px flex-1 bg-white/10"/><span>{formatDirectMessageDate(timestamp)}</span><span className="h-px flex-1 bg-white/10"/></div>}
                  <article className={`group flex rounded-md px-2 py-1.5 transition hover:bg-white/[0.025] ${chatDisplay.showAvatars ? "gap-3" : ""} ${grouped ? "pt-0.5" : "mt-2"}`}>
                    {chatDisplay.showAvatars && <div className="w-10 shrink-0">{!grouped && <button type="button" onMouseEnter={() => setHoveredDmProfileId(author.id)} onMouseLeave={() => setHoveredDmProfileId((id) => id === author.id ? null : id)} onClick={(event) => openMiniProfile(author, event.currentTarget)} aria-label={`Abrir perfil de ${author.display_name || author.username}`} className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand"><FriendAvatar profile={author} size="md" isHovered={hoveredDmProfileId === author.id}/></button>}</div>}
                    <div className="min-w-0 flex-1">
                      {!grouped && <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><button type="button" onMouseEnter={() => setHoveredDmProfileId(author.id)} onMouseLeave={() => setHoveredDmProfileId((id) => id === author.id ? null : id)} onClick={(event) => openMiniProfile(author, event.currentTarget)} className="rounded-sm text-sm font-semibold text-discord-header-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand">{author.display_name || author.username}</button><time className="text-[10px] text-discord-text-muted">{timestamp.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>}
                      {item.content === DIRECT_CALL_INVITE ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-discord-brand/30 bg-discord-brand/10 px-4 py-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-discord-brand/20 text-discord-brand"><PhoneCall size={18}/></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-discord-header-primary">Chamada de voz</span><span className="block text-xs text-discord-text-muted">{item.sender_id === currentUserId ? "Convite enviado" : "Convite recebido"}</span></span>
                        {item.sender_id !== currentUserId && (() => {
                          const fresh = Date.now() - timestamp.getTime() < 2 * 60 * 1000;
                          return <button type="button" disabled={!fresh} onClick={() => onJoinDirectCall?.(item.sender_id, author.display_name || author.username, false)} className="rounded-lg bg-discord-brand px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{fresh ? "Atender" : "Expirada"}</button>;
                        })()}
                      </div> : item.content ? <ChatMessageBody content={item.content} preferences={chatDisplay} /> : null}
                      {chatDisplay.showUploads && item.attachment_url && <a href={signedDmImageUrls[item.attachment_url] ?? signedDmImageCache.current.get(item.attachment_url) ?? item.attachment_url} target="_blank" rel="noreferrer" className="mt-1 inline-block max-w-full" aria-label="Abrir imagem enviada"><HoverGifImage src={signedDmImageUrls[item.attachment_url] ?? signedDmImageCache.current.get(item.attachment_url) ?? item.attachment_url} alt="Imagem enviada na conversa" className="max-h-80 max-w-full rounded-lg object-contain"/></a>}
                    </div>
                  </article>
                </div>;
              })}
            </div> : <div className="rounded-lg bg-discord-bg-secondary/60 p-4 text-sm text-discord-text-muted">{messageSearch ? "Nenhuma mensagem corresponde à busca." : "Ainda não há mensagens nesta conversa."}</div>}
          </div>
          {chatDisplay.composerPreview && dmDraft.trim() && !dmDraft.startsWith("/") && !dmDraft.startsWith("!") && (
            <div className="mx-2 mb-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 sm:mx-5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-discord-text-muted">Prévia</p>
              <ChatMessageBody content={dmDraft} preferences={chatDisplay} previewLinks={false} />
            </div>
          )}
          <form onSubmit={sendDirectMessage} className="mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] flex min-h-14 items-center gap-1 rounded-xl bg-discord-bg-secondary px-2 py-1.5 sm:mx-5 sm:gap-3 sm:px-4 sm:py-2">
            <label title="Enviar imagem" aria-label="Enviar imagem" className={`grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg text-discord-text-muted transition hover:bg-white/5 hover:text-white ${uploadingImage ? "pointer-events-none opacity-50" : ""}`}><ImageIcon size={21}/><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={uploadingImage} onChange={(event) => { void uploadDmImage(event.target.files?.[0]); event.currentTarget.value = ""; }}/></label>
            <input value={dmDraft} onChange={(event) => setDmDraft(event.target.value)} placeholder={`Enviar mensagem para @${activeFriend.username}`} aria-label={`Enviar mensagem para ${activeFriend.display_name || activeFriend.username}`} className="min-w-0 flex-1 bg-transparent py-1 text-base text-discord-text-normal outline-none placeholder:text-discord-text-muted sm:text-sm"/>
            <button type="button" onClick={() => setDmDraft((draft) => `${draft}${draft ? " " : ""}🙂`)} title="Adicionar emoji" aria-label="Adicionar emoji" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-discord-text-muted transition hover:bg-white/5 hover:text-white"><Smile size={20}/></button>
            <button type="submit" aria-label="Enviar mensagem" disabled={!dmDraft.trim() || uploadingImage} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-discord-brand text-white transition hover:brightness-110 disabled:opacity-35"><Send size={19}/></button>
          </form>
          {message && <p role="alert" className="mx-5 -mt-2 mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{message}</p>}
        </section>
        {profilePanelOpen && <aside className="absolute inset-y-0 right-0 z-20 flex w-[min(86vw,320px)] shrink-0 flex-col overflow-y-auto border-l border-black/20 bg-discord-bg-secondary shadow-2xl xl:static xl:z-auto xl:w-[320px] xl:shadow-none">
          <ProfileBanner src={activeFriend.banner_url} positionX={activeFriend.banner_position_x} positionY={activeFriend.banner_position_y} zoom={activeFriend.banner_zoom} className="aspect-[3.125/1] w-full shrink-0" style={{ background: activeFriend.profile_card_color || "#202127" }}>
            <button onClick={() => setProfilePanelOpen(false)} title="Fechar perfil" aria-label="Fechar perfil" className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white/80 hover:bg-black/65 hover:text-white xl:hidden"><X size={17}/></button>
          </ProfileBanner>
          <div className="relative flex-1 px-4 pb-5">
            <div className="-mt-10 mb-3 flex items-end justify-between">
              <FriendAvatar profile={activeFriend} size="profile" isHovered={hoveredDmProfileId === activeFriend.id}/>
              <span className="mb-1 rounded-full bg-discord-bg-primary px-2.5 py-1 text-[10px] font-medium text-discord-text-muted">{activeFriend.status === "idle" ? "Ausente" : activeFriend.status === "dnd" ? "Não perturbe" : activeFriend.status === "online" ? "Online" : "Offline"}</span>
            </div>
            <div className="rounded-lg bg-discord-bg-primary p-4">
              <h2 className="break-words text-xl font-bold leading-tight text-discord-header-primary"><button type="button" onMouseEnter={() => setHoveredDmProfileId(activeFriend.id)} onMouseLeave={() => setHoveredDmProfileId((id) => id === activeFriend.id ? null : id)} onClick={(event) => openMiniProfile(activeFriend, event.currentTarget)} className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand">{activeFriend.display_name || activeFriend.username}</button></h2>
              <p className="mt-1 break-all text-sm text-discord-text-normal">{activeFriend.username}</p>
              {!!activeFriend.badges?.length && <div className="mt-2"><CustomBadgeList badges={activeFriend.badges} limit={5} size="medium" /></div>}
              {activeFriend.pronouns && <p className="mt-1 text-xs text-discord-text-muted">{activeFriend.pronouns}</p>}
              {activeFriend.custom_status && <p className="mt-3 border-t border-white/10 pt-3 text-sm text-discord-text-normal">{activeFriend.custom_status}</p>}
              {friendActivity && <NowPlayingCard activity={friendActivity} />}
              {activeFriend.bio && <div className="mt-3 border-t border-white/10 pt-3"><h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-discord-text-muted">Sobre mim</h3><p className="whitespace-pre-wrap break-words text-sm text-discord-text-normal">{activeFriend.bio}</p></div>}
            </div>
          </div>
        </aside>}
      </div> : <><header className="flex h-14 shrink-0 items-center gap-2 border-b border-black/20 px-2 shadow-sm sm:px-5"><button type="button" onClick={onOpenMobileNavigation} aria-label="Abrir servidores" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-discord-bg-modifier-hover text-discord-text-normal md:hidden"><Menu className="h-5 w-5"/></button><Users className="h-5 w-5 text-discord-text-muted"/><span className="flex-1 font-semibold text-discord-header-primary">Amigos</span><button type="button" onClick={onOpenSettings} aria-label="Abrir configurações" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-white"><Settings className="h-5 w-5"/></button></header><div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-8"><div className="mx-auto w-full max-w-4xl">
      {tab === "pending" ? <section className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-secondary p-5 shadow-xl"><h1 className="text-xl font-bold text-discord-header-primary">Solicitações de amizade</h1><p className="mt-1 text-sm text-discord-text-muted">Aceite pedidos para iniciar uma conversa direta.</p>{incoming.length ? <div className="mt-4 space-y-2">{incoming.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-discord-bg-primary/60 p-3"><FriendIdentity profile={withLivePresence(item.sender)}/><button onClick={() => void accept(item.id)} className="flex items-center gap-2 rounded-lg bg-discord-brand px-3 py-2 text-sm text-white"><Check size={16}/>Aceitar</button></div>)}</div> : <p className="mt-5 rounded-xl bg-discord-bg-primary/50 p-5 text-sm text-discord-text-muted">Nenhuma solicitação no momento.</p>}</section> : <>
      <section className="rounded-lg bg-discord-bg-secondary p-5">
        <h1 className="text-xl font-bold text-discord-header-primary">Adicione amigos</h1>
        <p className="mt-1 text-sm text-discord-text-muted">Encontre alguém pelo nome de usuário do Sekai.</p>
        <form onSubmit={addFriend} className="mt-4 flex gap-2">
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nome de usuário" className="min-w-0 flex-1 rounded bg-discord-bg-primary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500" />
          <button disabled={busy || !username.trim()} className="flex items-center gap-2 rounded bg-discord-brand px-4 py-2 text-sm font-medium text-white hover:bg-discord-brand-hover disabled:opacity-50"><UserPlus className="h-4 w-4" />Adicionar</button>
        </form>
        {message && <p className="mt-3 text-sm text-discord-text-muted">{message}</p>}
      </section>

      {incoming.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">Solicitações recebidas — {incoming.length}</h2><div className="space-y-2">{incoming.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg bg-discord-bg-secondary p-3"><FriendIdentity profile={withLivePresence(item.sender)} /><button onClick={() => void accept(item.id)} className="flex items-center gap-2 rounded bg-discord-brand px-3 py-2 text-sm text-white"><Check className="h-4 w-4" />Aceitar</button></div>)}</div></section>}
      {serverInvites.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">Convites para servidores — {serverInvites.length}</h2><div className="space-y-2">{serverInvites.map((invite) => <div key={invite.id} className="flex items-center justify-between rounded-lg bg-discord-bg-secondary p-3"><div><p className="font-medium text-discord-text-normal">{invite.server_name}</p><p className="text-xs text-discord-text-muted">Convite de {invite.sender?.display_name || invite.sender?.username || "um amigo"}</p></div><button onClick={() => void acceptServerInvite(invite)} className="flex items-center gap-2 rounded bg-discord-brand px-3 py-2 text-sm text-white"><Check className="h-4 w-4" />Aceitar</button></div>)}</div></section>}
      {outgoing.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">Solicitações enviadas — {outgoing.length}</h2><div className="space-y-2">{outgoing.map((item) => <div key={item.id} className="rounded-lg bg-discord-bg-secondary p-3"><FriendIdentity profile={withLivePresence(item.receiver)} /><p className="ml-12 text-xs text-discord-text-muted">Pendente</p></div>)}</div></section>}
      <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">{tab === "online" ? "Amigos online" : "Todos os amigos"} — {tab === "online" ? friendProfiles.filter((p) => isOnline(p.id)).length : friends.length}</h2>
        {friends.length ? <div className="space-y-2">{friends.filter((item) => tab !== "online" || isOnline(other(item)?.id)).map((item) => { const profile = other(item); return <div key={item.id} onDoubleClick={() => profile && openConversation(profile)} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-discord-bg-secondary p-3 transition hover:border-white/10 hover:bg-discord-bg-secondary/80"><button onClick={() => profile && openConversation(profile)} className="text-left"><FriendIdentity profile={withLivePresence(profile)} /></button><div className="ml-auto flex items-center gap-2"><button onClick={() => profile && openConversation(profile)} title="Enviar mensagem direta" className="rounded-lg bg-discord-bg-primary p-2 text-discord-text-muted hover:text-white"><MessageCircle size={17}/></button><select aria-label="Servidor para convite" value={serverByFriend[profile?.id ?? ""] ?? servers[0]?.id ?? ""} onChange={(event) => profile && setServerByFriend((state) => ({ ...state, [profile.id]: event.target.value }))} className="max-w-40 rounded-lg bg-discord-bg-primary px-2 py-2 text-xs text-discord-text-normal">{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select><button onClick={() => void inviteFriend(profile)} disabled={!servers.length} className="flex items-center gap-2 rounded-lg bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover disabled:opacity-50"><Send className="h-4 w-4" />Convidar</button></div></div>; })}</div> : <p className="rounded-lg bg-discord-bg-secondary p-5 text-sm text-discord-text-muted">Ainda sem amigos. Adicione alguém pelo nome de usuário para conversar, enviar um convite de servidor e entrar na mesma sala de voz.</p>}
      </section>
      </>}
    </div></div></>}
    </main>
    {miniProfile && miniProfile.profile.id !== currentUserId && <UserProfileCard
      profile={miniProfile.profile}
      position={miniProfile.position}
      currentUserId={currentUserId}
      onClose={() => setMiniProfile(null)}
      onQuickMessage={(content) => sendQuickDirectMessage(miniProfile.profile, content)}
      onMessage={miniProfile.profile.id !== currentUserId && miniProfileContact ? () => openConversation(miniProfileContact) : undefined}
    />}
  </div>;
}

function formatDirectMessageDate(date: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function FriendAvatar({ profile, size = "md", showStatus = true, isHovered = false, statusSurface }: { profile?: Profile; size?: "sm" | "md" | "lg" | "profile"; showStatus?: boolean; isHovered?: boolean; statusSurface?: string }) {
  const dimensions = {
    sm: "h-9 w-9 text-sm",
    md: "h-10 w-10 text-sm",
    lg: "h-[76px] w-[76px] text-xl",
    profile: "h-[78px] w-[78px] border-4 border-discord-bg-secondary text-xl",
  }[size];
  const presence: Presence = profile?.status === "online" || profile?.status === "idle" || profile?.status === "dnd" || profile?.status === "offline" ? profile.status : "offline";
  const surface = statusSurface ?? (size === "profile" ? "rgb(var(--d-secondary))" : "rgb(var(--d-primary))");
  const name = profile?.display_name || profile?.username || "Usuário";
  return <span className="relative inline-flex shrink-0 overflow-visible align-middle">
    <span className={`relative flex ${dimensions} items-center justify-center overflow-hidden rounded-full bg-discord-bg-dark font-semibold text-white`}>
      {profile?.avatar_url ? <CroppedProfileImage src={profile.avatar_url} alt={`${name} avatar`} isHovered={isHovered} positionX={profile.avatar_position_x} positionY={profile.avatar_position_y} zoom={profile.avatar_zoom}/> : name[0]?.toUpperCase()}
    </span>
    {showStatus && profile && <PresenceIndicator presence={presence} avatarBadge borderColor={surface} cutoutColor={surface}/>}
  </span>;
}

function FriendIdentity({ profile, compact = false, isHovered = false, onHoverChange, onProfileClick }: {
  profile?: Profile;
  compact?: boolean;
  isHovered?: boolean;
  onHoverChange?: (hovered: boolean) => void;
  onProfileClick?: (profile: Profile, anchor: HTMLButtonElement) => void;
}) {
  const content = <>
    <FriendAvatar profile={profile} size={compact ? "sm" : "md"} isHovered={isHovered}/>
    <span className="min-w-0 text-left">
      <span className="block truncate text-sm font-medium text-discord-text-normal">{profile?.display_name || profile?.username || "Usuário"}</span>
      <span className="block truncate text-xs text-discord-text-muted">@{profile?.username || ""}</span>
    </span>
  </>;

  if (profile && onProfileClick) return <button
    type="button"
    onClick={(event) => onProfileClick(profile, event.currentTarget)}
    onMouseEnter={() => onHoverChange?.(true)}
    onMouseLeave={() => onHoverChange?.(false)}
    aria-label={`Abrir perfil de ${profile.display_name || profile.username}`}
    className="flex min-w-0 items-center gap-3 rounded-md text-left transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand"
  >{content}</button>;

  return <div className="flex min-w-0 items-center gap-3">{content}</div>;
}
