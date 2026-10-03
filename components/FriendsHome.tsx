"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Send, UserPlus, Users, MessageCircle, Search, Inbox, Circle, ArrowLeft, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDialogs } from "@/components/DialogProvider";

interface FriendHomeProps {
  currentUserId: string;
  servers: { id: string; name: string }[];
  onJoined: (serverId: string, channelId: string | null) => void;
  openUserId?: string | null;
  onDirectMessageOpened?: () => void;
  unreadByUser?: Record<string, number>;
  onMarkDirectRead?: (userId: string) => void;
  onlineUserIds?: string[];
}

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; status: string | null };
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

export function FriendsHome({ currentUserId, servers, onJoined, openUserId, onDirectMessageOpened, unreadByUser = {}, onMarkDirectRead, onlineUserIds = [] }: FriendHomeProps) {
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
  const [dmDraft, setDmDraft] = useState("");
  const [recentProfiles, setRecentProfiles] = useState<Profile[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const dmScrollRef = useRef<HTMLDivElement>(null);
  const dmWasAtBottom = useRef(true);

  const loadFriends = useCallback(async () => {
    const [{ data, error }, { data: inviteRows }] = await Promise.all([
      supabase.from("friendships")
      .select("id,sender_id,receiver_id,status,sender:profiles!friendships_sender_id_fkey(id,username,display_name,avatar_url,status),receiver:profiles!friendships_receiver_id_fkey(id,username,display_name,avatar_url,status)")
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
    const { data: profiles } = await supabase.from("profiles").select("id,username,display_name,avatar_url,status").in("id", ids);
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
    void supabase.from("profiles").select("id,username,display_name,avatar_url,status").eq("id", openUserId).maybeSingle().then(({ data }) => {
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
    dmWasAtBottom.current = true;
  }, [selectedFriend?.id]);
  useEffect(() => {
    const element = dmScrollRef.current;
    if (element && dmWasAtBottom.current) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [dmMessages]);
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

  const onlineConversations = useMemo(
    () => conversationProfiles.map((profile) => ({ ...profile, status: isOnline(profile.id) ? "online" : "offline" })),
    // Presence is a live list maintained by Supabase Realtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationProfiles, onlineUserIds]
  );

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

  return <div className="flex min-w-0 flex-1 overflow-hidden bg-discord-bg-primary">
    <aside className="flex w-[270px] shrink-0 flex-col border-r border-black/20 bg-discord-bg-secondary/70">
      <div className="p-3"><button className="flex w-full items-center gap-2 rounded-lg bg-discord-bg-primary/70 px-3 py-2 text-sm text-discord-text-muted transition hover:bg-discord-bg-primary"><Search size={16}/>Buscar</button></div>
      <nav className="space-y-1 px-2">
        <button onClick={() => { setSelectedFriend(null); setTab("online"); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === "online" && !selectedFriend ? "bg-discord-bg-modifier-hover text-white" : "text-discord-text-muted hover:bg-discord-bg-modifier-hover/60"}`}><Users size={18}/>Amigos online</button>
        <button onClick={() => { setSelectedFriend(null); setTab("all"); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === "all" && !selectedFriend ? "bg-discord-bg-modifier-hover text-white" : "text-discord-text-muted hover:bg-discord-bg-modifier-hover/60"}`}><Users size={18}/>Todos</button>
        <button onClick={() => { setSelectedFriend(null); setTab("pending"); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === "pending" && !selectedFriend ? "bg-discord-bg-modifier-hover text-white" : "text-discord-text-muted hover:bg-discord-bg-modifier-hover/60"}`}><Inbox size={18}/>Solicitações {incoming.length > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">{incoming.length}</span>}</button>
      </nav>
      <div className="mx-3 my-4 border-t border-black/20"/><div className="flex items-center justify-between px-4 pb-2 text-[11px] font-bold uppercase tracking-wide text-discord-text-muted">Mensagens diretas <button title="Adicionar amigo" onClick={() => { setSelectedFriend(null); setTab("all"); }}><UserPlus size={15}/></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">{onlineConversations.map((profile) => <button key={profile.id} onClick={() => openConversation(profile)} className={`relative flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${selectedFriend?.id === profile.id ? "bg-discord-bg-modifier-hover" : "hover:bg-discord-bg-modifier-hover/60"}`}><div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-discord-bg-dark">{profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center text-sm text-white">{(profile.display_name || profile.username)[0]?.toUpperCase()}</span>}<Circle size={11} className={`absolute bottom-0 right-0 fill-current ${profile.status === "online" ? "text-emerald-400" : "text-gray-500"}`}/></div><span className="truncate text-sm font-medium text-discord-text-normal">{profile.display_name || profile.username}</span>{!!unreadByUser[profile.id] && <span className="ml-auto min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[10px] font-bold text-white">{unreadByUser[profile.id]}</span>}</button>)}</div>
    </aside>
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {selectedFriend ? <><header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/20 px-5 shadow-sm"><button className="md:hidden" onClick={() => setSelectedFriend(null)}><ArrowLeft size={18}/></button><FriendIdentity profile={selectedFriend}/><span className="hidden text-xs text-discord-text-muted sm:block">Mensagem direta</span></header><div ref={dmScrollRef} onScroll={trackDmScroll} className="min-h-0 flex-1 overflow-y-auto p-5"><div className="mb-5 border-b border-black/20 pb-5"><FriendIdentity profile={selectedFriend}/><p className="mt-2 text-sm text-discord-text-muted">Esta é sua conversa com {selectedFriend.display_name || selectedFriend.username}.</p></div><div className="space-y-3">{dmMessages.map((message) => <div key={message.id} className={`flex ${message.sender_id === currentUserId ? "justify-end" : "justify-start"}`}><div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${message.sender_id === currentUserId ? "bg-discord-brand text-white" : "bg-discord-bg-secondary text-discord-text-normal"}`}>{message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}{message.attachment_url && <a href={message.attachment_url} target="_blank" rel="noreferrer" className="mt-2 block"><img src={message.attachment_url} alt="Imagem enviada" className="max-h-80 rounded-lg" /></a>}<time className="mt-1 block text-right text-[10px] opacity-60">{new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></div></div>)}</div></div><form onSubmit={sendDirectMessage} className="m-4 flex items-center gap-3 rounded-xl bg-discord-bg-secondary px-4 py-3 shadow-lg"><label title="Enviar imagem" className="cursor-pointer text-discord-text-muted hover:text-white"><ImageIcon size={19}/><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={uploadingImage} onChange={(event) => { void uploadDmImage(event.target.files?.[0]); event.currentTarget.value = ""; }}/></label><input value={dmDraft} onChange={(event) => setDmDraft(event.target.value)} placeholder={`Enviar mensagem para @${selectedFriend.username}`} className="min-w-0 flex-1 bg-transparent text-sm text-discord-text-normal outline-none"/><button aria-label="Enviar mensagem" disabled={!dmDraft.trim() || uploadingImage} className="text-discord-brand disabled:opacity-40"><Send size={18}/></button></form>{message && <p role="alert" className="mx-4 -mt-2 mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{message}</p>}</> : <><header className="flex h-14 shrink-0 items-center gap-2 border-b border-black/20 px-5 shadow-sm"><Users className="h-5 w-5 text-discord-text-muted"/><span className="font-semibold text-discord-header-primary">Amigos</span></header><div className="flex-1 overflow-y-auto p-5 md:p-8"><div className="mx-auto w-full max-w-4xl">
      {tab === "pending" ? <section className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-secondary p-5 shadow-xl"><h1 className="text-xl font-bold text-discord-header-primary">Solicitações de amizade</h1><p className="mt-1 text-sm text-discord-text-muted">Aceite pedidos para iniciar uma conversa direta.</p>{incoming.length ? <div className="mt-4 space-y-2">{incoming.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-discord-bg-primary/60 p-3"><FriendIdentity profile={item.sender}/><button onClick={() => void accept(item.id)} className="flex items-center gap-2 rounded-lg bg-discord-brand px-3 py-2 text-sm text-white"><Check size={16}/>Aceitar</button></div>)}</div> : <p className="mt-5 rounded-xl bg-discord-bg-primary/50 p-5 text-sm text-discord-text-muted">Nenhuma solicitação no momento.</p>}</section> : <>
      <section className="rounded-lg bg-discord-bg-secondary p-5">
        <h1 className="text-xl font-bold text-discord-header-primary">Adicione amigos</h1>
        <p className="mt-1 text-sm text-discord-text-muted">Encontre alguém pelo nome de usuário do Sekai.</p>
        <form onSubmit={addFriend} className="mt-4 flex gap-2">
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nome de usuário" className="min-w-0 flex-1 rounded bg-discord-bg-primary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500" />
          <button disabled={busy || !username.trim()} className="flex items-center gap-2 rounded bg-discord-brand px-4 py-2 text-sm font-medium text-white hover:bg-discord-brand-hover disabled:opacity-50"><UserPlus className="h-4 w-4" />Adicionar</button>
        </form>
        {message && <p className="mt-3 text-sm text-discord-text-muted">{message}</p>}
      </section>

      {incoming.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">Solicitações recebidas — {incoming.length}</h2><div className="space-y-2">{incoming.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg bg-discord-bg-secondary p-3"><FriendIdentity profile={item.sender} /><button onClick={() => void accept(item.id)} className="flex items-center gap-2 rounded bg-discord-brand px-3 py-2 text-sm text-white"><Check className="h-4 w-4" />Aceitar</button></div>)}</div></section>}
      {serverInvites.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">Convites para servidores — {serverInvites.length}</h2><div className="space-y-2">{serverInvites.map((invite) => <div key={invite.id} className="flex items-center justify-between rounded-lg bg-discord-bg-secondary p-3"><div><p className="font-medium text-discord-text-normal">{invite.server_name}</p><p className="text-xs text-discord-text-muted">Convite de {invite.sender?.display_name || invite.sender?.username || "um amigo"}</p></div><button onClick={() => void acceptServerInvite(invite)} className="flex items-center gap-2 rounded bg-discord-brand px-3 py-2 text-sm text-white"><Check className="h-4 w-4" />Aceitar</button></div>)}</div></section>}
      {outgoing.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">Solicitações enviadas — {outgoing.length}</h2><div className="space-y-2">{outgoing.map((item) => <div key={item.id} className="rounded-lg bg-discord-bg-secondary p-3"><FriendIdentity profile={item.receiver} /><p className="ml-12 text-xs text-discord-text-muted">Pendente</p></div>)}</div></section>}
      <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">{tab === "online" ? "Amigos online" : "Todos os amigos"} — {tab === "online" ? friendProfiles.filter((p) => isOnline(p.id)).length : friends.length}</h2>
        {friends.length ? <div className="space-y-2">{friends.filter((item) => tab !== "online" || isOnline(other(item)?.id)).map((item) => { const profile = other(item); return <div key={item.id} onDoubleClick={() => profile && openConversation(profile)} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-discord-bg-secondary p-3 transition hover:border-white/10 hover:bg-discord-bg-secondary/80"><button onClick={() => profile && openConversation(profile)} className="text-left"><FriendIdentity profile={profile} /></button><div className="ml-auto flex items-center gap-2"><button onClick={() => profile && openConversation(profile)} title="Enviar mensagem direta" className="rounded-lg bg-discord-bg-primary p-2 text-discord-text-muted hover:text-white"><MessageCircle size={17}/></button><select aria-label="Servidor para convite" value={serverByFriend[profile?.id ?? ""] ?? servers[0]?.id ?? ""} onChange={(event) => profile && setServerByFriend((state) => ({ ...state, [profile.id]: event.target.value }))} className="max-w-40 rounded-lg bg-discord-bg-primary px-2 py-2 text-xs text-discord-text-normal">{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select><button onClick={() => void inviteFriend(profile)} disabled={!servers.length} className="flex items-center gap-2 rounded-lg bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover disabled:opacity-50"><Send className="h-4 w-4" />Convidar</button></div></div>; })}</div> : <p className="rounded-lg bg-discord-bg-secondary p-5 text-sm text-discord-text-muted">Ainda sem amigos. Adicione alguém pelo nome de usuário para conversar, enviar um convite de servidor e entrar na mesma sala de voz.</p>}
      </section>
      </>}
    </div></div></>}
    </main>
  </div>;
}

function FriendIdentity({ profile }: { profile?: Profile }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-discord-bg-dark text-sm font-semibold">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (profile?.display_name || profile?.username || "?")[0]?.toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-discord-text-normal">{profile?.display_name || profile?.username || "Usuário"}</p>
        <p className="truncate text-xs text-discord-text-muted">@{profile?.username}</p>
      </div>
    </div>
  );
}
