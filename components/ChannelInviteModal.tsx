"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, LoaderCircle, Search, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDialogs } from "@/components/DialogProvider";
import type { Channel } from "@/components/ChannelSidebar";

interface ChannelInviteModalProps {
  channel: Channel;
  serverId: string;
  serverName: string;
  currentUserId: string;
  onClose: () => void;
}

type FriendOption = { id: string; username: string; display_name: string | null; avatar_url: string | null };

export function ChannelInviteModal({ channel, serverId, serverName, currentUserId, onClose }: ChannelInviteModalProps) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: rows, error: friendshipError } = await supabase.from("friendships")
        .select("sender_id,receiver_id")
        .eq("status", "accepted")
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);
      if (friendshipError) {
        if (!cancelled) setError(friendshipError.message);
        if (!cancelled) setLoading(false);
        return;
      }
      const ids = Array.from(new Set((rows ?? []).map((row) => row.sender_id === currentUserId ? row.receiver_id : row.sender_id)))
        .filter((id) => id !== currentUserId);
      if (!ids.length) { if (!cancelled) { setFriends([]); setLoading(false); } return; }
      const { data: profiles, error: profileError } = await supabase.from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", ids)
        .order("display_name");
      if (!cancelled) {
        if (profileError) setError(profileError.message);
        setFriends((profiles ?? []) as FriendOption[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId, supabase]);

  const visibleFriends = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    if (!search) return friends;
    return friends.filter((friend) => `${friend.display_name ?? ""} ${friend.username}`.toLocaleLowerCase("pt-BR").includes(search));
  }, [friends, query]);

  async function ensureInvite() {
    if (inviteCode) return inviteCode;
    const { data, error: createError } = await supabase.from("invites").insert({
      server_id: serverId,
      channel_id: channel.id,
      inviter_id: currentUserId,
      max_uses: 0,
      max_age: 0,
    }).select("code").single();
    if (createError || !data?.code) throw new Error(createError?.message || "Não foi possível gerar o convite.");
    setInviteCode(data.code);
    return data.code as string;
  }

  function inviteUrl(code: string) {
    const url = new URL(window.location.origin);
    url.searchParams.set("invite", code);
    url.searchParams.set("channel", channel.id);
    return url.toString();
  }

  async function copyInvite() {
    setWorking(true); setError("");
    try {
      const code = await ensureInvite();
      const url = inviteUrl(code);
      try { await navigator.clipboard.writeText(url); }
      catch { window.prompt("Copie o link do convite:", url); }
      await dialogs.notify({ title: "Convite pronto", message: `O link direciona para #${channel.name} em ${serverName}.` });
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Não foi possível copiar o convite.");
    } finally { setWorking(false); }
  }

  async function sendInvites() {
    if (!selectedIds.length) { setError("Selecione pelo menos um amigo."); return; }
    setWorking(true); setError("");
    try {
      const code = await ensureInvite();
      const { error: sendError } = await supabase.from("friend_server_invites").insert(selectedIds.map((receiverId) => ({
        sender_id: currentUserId,
        receiver_id: receiverId,
        server_id: serverId,
        server_name: serverName,
        channel_id: channel.id,
        invite_code: code,
      })));
      if (sendError) throw new Error(sendError.message);
      const url = inviteUrl(code);
      try { await navigator.clipboard.writeText(url); } catch { /* O convite interno já foi enviado. */ }
      await dialogs.notify({ title: "Convite enviado", message: `${selectedIds.length} amigo(s) recebeu(ram) um convite para #${channel.name}.` });
      onClose();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Não foi possível enviar os convites.");
    } finally { setWorking(false); }
  }

  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="channel-invite-title" className="flex max-h-[min(680px,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-secondary shadow-2xl">
      <header className="flex items-start justify-between border-b border-white/[0.07] px-5 py-4">
        <div><h2 id="channel-invite-title" className="text-lg font-bold text-discord-header-primary">Convidar para #{channel.name}</h2><p className="mt-1 text-xs text-discord-text-muted">Escolha amigos ou copie um link para este canal.</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-discord-text-muted hover:bg-white/5 hover:text-white"><X size={18}/></button>
      </header>
      <div className="border-b border-white/[0.07] p-4">
        <label className="flex items-center gap-2 rounded-lg bg-discord-bg-primary px-3 py-2 text-discord-text-muted focus-within:ring-1 focus-within:ring-discord-brand"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar amigos" className="min-w-0 flex-1 bg-transparent text-sm text-discord-text-normal outline-none placeholder:text-discord-text-muted"/></label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-discord-text-muted"><LoaderCircle className="h-4 w-4 animate-spin"/>Carregando amigos…</div>
          : visibleFriends.length ? visibleFriends.map((friend) => {
            const selected = selectedIds.includes(friend.id);
            return <button key={friend.id} type="button" onClick={() => setSelectedIds((ids) => selected ? ids.filter((id) => id !== friend.id) : [...ids, friend.id])} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-discord-bg-modifier-hover">
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-discord-bg-primary text-sm font-semibold text-white">{friend.avatar_url ? <img src={friend.avatar_url} alt="" className="h-full w-full object-cover"/> : (friend.display_name || friend.username)[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-discord-text-normal">{friend.display_name || friend.username}</span><span className="block truncate text-xs text-discord-text-muted">@{friend.username}</span></span>
              <span className={`grid h-5 w-5 place-items-center rounded-full border ${selected ? "border-discord-brand bg-discord-brand text-white" : "border-white/20 text-transparent"}`}>{selected && <Check size={13}/>}</span>
            </button>;
          }) : <p className="p-8 text-center text-sm text-discord-text-muted">{friends.length ? "Nenhum amigo corresponde à busca." : "Você ainda não tem amigos para convidar."}</p>}
      </div>
      {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      <footer className="flex flex-wrap justify-between gap-2 border-t border-white/[0.07] p-4">
        <button type="button" disabled={working} onClick={() => void copyInvite()} className="inline-flex items-center gap-2 rounded-lg bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover disabled:opacity-50"><Copy size={15}/>Copiar link</button>
        <button type="button" disabled={working || !selectedIds.length} onClick={() => void sendInvites()} className="inline-flex items-center gap-2 rounded-lg bg-discord-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"><UserPlus size={16}/>{working ? "Enviando…" : `Convidar${selectedIds.length ? ` (${selectedIds.length})` : ""}`}</button>
      </footer>
    </section>
  </div>;
}
