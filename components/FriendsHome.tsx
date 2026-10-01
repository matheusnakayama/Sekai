"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Send, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDialogs } from "@/components/DialogProvider";

interface FriendHomeProps {
  currentUserId: string;
  servers: { id: string; name: string }[];
  onJoined: (serverId: string, channelId: string | null) => void;
}

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; status: string | null };
type Friendship = { id: string; sender_id: string; receiver_id: string; status: "pending" | "accepted"; sender?: Profile; receiver?: Profile };
type ServerInvite = { id: string; sender_id: string; server_id: string; server_name: string; channel_id: string | null; status: "pending" | "accepted"; sender?: Profile };

export function FriendsHome({ currentUserId, servers, onJoined }: FriendHomeProps) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [username, setUsername] = useState("");
  const [requests, setRequests] = useState<Friendship[]>([]);
  const [serverInvites, setServerInvites] = useState<ServerInvite[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverByFriend, setServerByFriend] = useState<Record<string, string>>({});

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
    if (error) { setMessage("Ative a migração de amizades no Supabase para usar esta área."); return; }
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

  function other(item: Friendship) { return item.sender_id === currentUserId ? item.receiver : item.sender; }

  async function addFriend(event: React.FormEvent) {
    event.preventDefault(); setMessage(""); setBusy(true);
    const name = username.trim().replace(/^@/, "");
    const { data: profile, error: lookupError } = await supabase.from("profiles").select("id").eq("username", name).maybeSingle();
    if (lookupError || !profile) { setMessage("Não encontramos esse nome de usuário."); setBusy(false); return; }
    if (profile.id === currentUserId) { setMessage("Você não pode adicionar a si mesmo."); setBusy(false); return; }
    const { error } = await supabase.from("friendships").insert({ sender_id: currentUserId, receiver_id: profile.id, status: "pending" });
    setBusy(false);
    if (error) { setMessage(error.code === "23505" ? "Já existe uma solicitação para esse usuário." : "Não foi possível enviar a solicitação. Confira a migração do Supabase."); return; }
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

  return <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-discord-bg-primary">
    <header className="flex h-12 shrink-0 items-center border-b border-black/20 px-5 shadow-sm"><Users className="mr-2 h-5 w-5 text-discord-text-muted" /><span className="font-semibold">Amigos</span></header>
    <div className="mx-auto w-full max-w-4xl p-6">
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
      <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-text-muted">Seus amigos — {friends.length}</h2>
        {friends.length ? <div className="space-y-2">{friends.map((item) => { const profile = other(item); return <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-discord-bg-secondary p-3"><FriendIdentity profile={profile} /><div className="ml-auto flex items-center gap-2"><select aria-label="Servidor para convite" value={serverByFriend[profile?.id ?? ""] ?? servers[0]?.id ?? ""} onChange={(event) => profile && setServerByFriend((state) => ({ ...state, [profile.id]: event.target.value }))} className="max-w-40 rounded bg-discord-bg-primary px-2 py-2 text-xs text-discord-text-normal">{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select><button onClick={() => void inviteFriend(profile)} disabled={!servers.length} className="flex items-center gap-2 rounded bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover disabled:opacity-50"><Send className="h-4 w-4" />Convidar</button></div></div>; })}</div> : <p className="rounded-lg bg-discord-bg-secondary p-5 text-sm text-discord-text-muted">Ainda sem amigos. Adicione alguém pelo nome de usuário para enviar um convite de servidor e entrar na mesma sala de voz.</p>}
      </section>
    </div>
  </main>;
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
