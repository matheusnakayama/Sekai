"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Activity, Gamepad2, Headphones, MessageCircle, MoreHorizontal, Music2, Pencil, SendHorizontal, Users, UserPlus, ZoomIn, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, getProfilePalette } from "@/lib/utils";
import { CroppedProfileImage, ProfileBanner } from "@/components/ProfileBanner";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { GameActivityCard, ProfileConnections, SpotifyMark, useConnections, useGameActivity, useNowPlaying } from "@/components/NowPlayingCard";
import { safeSpotifyArtUrl } from "@/lib/spotify";
import type { MemberItem, MemberVoiceActivity, ServerRoleOption } from "@/components/MemberList";
import type { MutualServer } from "@/components/UserProfileCard";

type MutualFriend = { id: string; name: string; avatarUrl?: string | null };

export function MemberProfileDialog({
  profile,
  currentUserId,
  immediateMutualServer,
  voiceActivity,
  onClose,
  onMessage,
  onQuickMessage,
  onAddFriend,
  onKick,
  onOpenSettings,
  onOpenVoiceActivity,
  roles = [],
  canManageRoles = false,
  onToggleRole,
}: {
  profile: MemberItem;
  currentUserId: string;
  immediateMutualServer?: MutualServer | null;
  voiceActivity?: MemberVoiceActivity;
  onClose: () => void;
  onMessage?: () => void;
  onQuickMessage?: (content: string) => Promise<void>;
  onAddFriend?: () => void;
  onKick?: () => void;
  onOpenSettings?: () => void;
  onOpenVoiceActivity?: (activity: MemberVoiceActivity) => void;
  roles?: ServerRoleOption[];
  canManageRoles?: boolean;
  onToggleRole?: (role: ServerRoleOption, assigned: boolean) => void;
}) {
  const supabase = createClient();
  const isSelf = profile.id === currentUserId;
  const palette = getProfilePalette(profile.profileCardColor);
  const gameActivity = useGameActivity(profile.id, profile.status);
  const listening = useNowPlaying(profile.id, profile.status);
  const connections = useConnections(profile.id, isSelf);
  const [tab, setTab] = useState<"atividade" | "amigos" | "servidores">("atividade");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [mutualFriends, setMutualFriends] = useState<MutualFriend[]>([]);
  const [mutualServers, setMutualServers] = useState<MutualServer[]>(immediateMutualServer ? [immediateMutualServer] : []);
  const [mutualDataLoading, setMutualDataLoading] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState(false);
  const [quickMessage, setQuickMessage] = useState("");
  const [quickMessageError, setQuickMessageError] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (avatarPreview) setAvatarPreview(false);
      else if (actionsOpen) setActionsOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actionsOpen, avatarPreview, onClose]);

  useEffect(() => {
    let cancelled = false;
    setMutualDataLoading(true);
    async function loadMutuals() {
      const [ownEdges, otherEdges, ownMemberships, targetMemberships] = await Promise.all([
        supabase.from("friendships").select("sender_id, receiver_id").eq("status", "accepted").or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`),
        isSelf
          ? Promise.resolve({ data: null, error: null })
          : supabase.from("friendships").select("sender_id, receiver_id").eq("status", "accepted").or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`),
        supabase.from("members").select("server_id").eq("user_id", currentUserId),
        supabase.from("members").select("server_id, servers(id,name,icon_url)").eq("user_id", profile.id),
      ]);
      if (cancelled) return;

      const ownFriendIds = (ownEdges.data ?? []).map((edge: any) => edge.sender_id === currentUserId ? edge.receiver_id : edge.sender_id);
      const targetFriendIds = isSelf
        ? ownFriendIds
        : (otherEdges.data ?? []).map((edge: any) => edge.sender_id === profile.id ? edge.receiver_id : edge.sender_id);
      const friendIds = Array.from(new Set(ownFriendIds.filter((id: string) => targetFriendIds.includes(id) && id !== profile.id && id !== currentUserId))).slice(0, 40);
      const friendsResult = friendIds.length
        ? await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", friendIds)
        : { data: [], error: null };
      if (cancelled) return;
      setMutualFriends((friendsResult.data ?? []).map((friend: any) => ({ id: friend.id, name: friend.display_name || friend.username || "Usuário", avatarUrl: friend.avatar_url })));

      const ownServerIds = new Set((ownMemberships.data ?? []).map((row: any) => row.server_id));
      const mutualById = new Map<string, MutualServer>();
      for (const row of targetMemberships.data ?? []) {
        if (!ownServerIds.has(row.server_id)) continue;
        const server = Array.isArray(row.servers) ? row.servers[0] : row.servers;
        if (server?.id) mutualById.set(server.id, { id: server.id, name: server.name, iconUrl: server.icon_url });
      }
      if (immediateMutualServer?.id) mutualById.set(immediateMutualServer.id, immediateMutualServer);
      setMutualServers(Array.from(mutualById.values()));
      setMutualDataLoading(false);
    }
    void loadMutuals().catch(() => { if (!cancelled) setMutualDataLoading(false); });
    return () => { cancelled = true; };
  }, [currentUserId, immediateMutualServer?.id, immediateMutualServer?.name, immediateMutualServer?.iconUrl, isSelf, profile.id, supabase]);

  async function submitQuickMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = quickMessage.trim();
    if (!content || !onQuickMessage || sendingMessage) return;
    setSendingMessage(true);
    setQuickMessageError("");
    try {
      await onQuickMessage(content);
      setQuickMessage("");
    } catch (error) {
      setQuickMessageError(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSendingMessage(false);
    }
  }

  const tabs = [
    { id: "atividade" as const, label: "Atividade" },
    { id: "amigos" as const, label: isSelf ? "Amigos" : "Amigos mútuos", count: mutualFriends.length },
    { id: "servidores" as const, label: "Servidores mútuos", count: mutualServers.length },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={`Perfil de ${profile.displayName}`} className="relative flex h-[min(780px,calc(100dvh-24px))] w-[min(1040px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/10 shadow-[0_28px_100px_rgba(0,0,0,.72)] md:flex-row" style={{ background: palette.background, color: palette.text, borderColor: palette.border }}>
        <button type="button" onClick={onClose} aria-label="Fechar perfil" className="absolute right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/75 hover:text-white"><X size={18}/></button>

        <aside className="flex max-h-[42dvh] w-full shrink-0 flex-col overflow-y-auto border-b border-white/10 md:max-h-full md:w-[330px] md:border-b-0 md:border-r" style={{ borderColor: palette.border }}>
          <ProfileBanner src={profile.bannerUrl} positionX={profile.bannerPositionX} positionY={profile.bannerPositionY} zoom={profile.bannerZoom} className="h-32 shrink-0">
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.13em] text-white/80 backdrop-blur"><Activity size={12}/>{profile.status === "offline" ? "Offline" : profile.status === "dnd" ? "Não perturbe" : profile.status === "idle" ? "Ausente" : "Online"}</div>
            {onKick && <><button type="button" onClick={() => setActionsOpen((open) => !open)} aria-label="Mais ações do perfil" aria-expanded={actionsOpen} className="absolute right-14 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/45 text-white/85 transition hover:bg-black/70"><MoreHorizontal size={19}/></button>{actionsOpen && <div role="menu" className="absolute right-14 top-14 z-20 min-w-40 rounded-lg border border-white/10 bg-[#18191c] p-1.5 shadow-xl"><button type="button" role="menuitem" onClick={() => { setActionsOpen(false); onClose(); onKick(); }} className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-red-300 transition hover:bg-red-500/10">Expulsar do servidor</button></div>}</>}
          </ProfileBanner>

          <div className="px-5 pb-5">
            <div className="relative -mt-10 mb-3 h-20 w-20">
              <button type="button" onClick={() => { if (isSelf && onOpenSettings) { onClose(); onOpenSettings(); } else setAvatarPreview(true); }} aria-label={isSelf && onOpenSettings ? "Editar avatar" : `Ampliar avatar de ${profile.displayName}`} title={isSelf && onOpenSettings ? "Editar avatar" : "Ampliar avatar"} className="group relative h-20 w-20 overflow-hidden rounded-full border-[5px] shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand" style={{ borderColor: palette.surface, backgroundColor: palette.inset }}>
                {profile.avatarUrl ? <CroppedProfileImage src={profile.avatarUrl} alt={profile.displayName} positionX={profile.avatarPositionX} positionY={profile.avatarPositionY} zoom={profile.avatarZoom} pauseGif={false} className="rounded-full"/> : <span className="grid h-full place-items-center text-3xl font-bold">{profile.displayName[0]?.toUpperCase()}</span>}
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/0 text-white opacity-0 transition duration-200 group-hover:bg-black/60 group-hover:opacity-100 group-focus-visible:bg-black/60 group-focus-visible:opacity-100">{isSelf ? <Pencil size={20}/> : <ZoomIn size={20}/>}</span>
              </button>
              <span className="pointer-events-none absolute -right-0.5 bottom-1 z-10"><PresenceIndicator presence={profile.status} avatarBadge borderColor={palette.surface} cutoutColor={palette.surface}/></span>
            </div>

            <h1 className="truncate text-[23px] font-bold leading-7">{profile.displayName}</h1>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" style={{ color: palette.muted }}>
              <span className="truncate">@{profile.username || profile.id.slice(0, 8)}</span>
              {profile.pronouns && <><span aria-hidden="true">·</span><span>{profile.pronouns}</span></>}
              <CustomBadgeList badges={profile.badges} limit={5} size="medium"/>
            </div>

            <div className="mt-4 flex gap-2">
              {isSelf && onOpenSettings ? <button type="button" onClick={() => { onClose(); onOpenSettings(); }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-discord-brand px-3 py-2.5 text-xs font-bold text-white transition hover:brightness-110"><Pencil size={14}/>Editar perfil</button> : <>
                {onMessage && <button type="button" onClick={() => { onClose(); onMessage(); }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-discord-brand px-3 py-2.5 text-xs font-bold text-white transition hover:brightness-110"><MessageCircle size={14}/>Mensagem</button>}
                {onAddFriend && <button type="button" onClick={onAddFriend} aria-label="Adicionar amigo" title="Adicionar amigo" className="grid h-9 w-10 place-items-center rounded-lg border border-white/10 bg-white/[.06] transition hover:bg-white/[.12]"><UserPlus size={16}/></button>}
              </>}
            </div>

            {profile.customStatus && <div className="mt-4 rounded-xl border border-white/[.07] p-3" style={{ backgroundColor: palette.inset, borderColor: palette.border }}><span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em]" style={{ color: palette.muted }}><Activity size={12}/>Status</span><p className="break-words text-[13px] leading-5">{profile.customStatus}</p></div>}
            {profile.bio && <div className="mt-4"><h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[.13em]" style={{ color: palette.muted }}>Sobre mim</h2><p className="whitespace-pre-wrap break-words text-[13px] leading-5">{profile.bio}</p></div>}

            {profile.assignedRoles?.length || canManageRoles && roles.length ? <div className="mt-4"><h2 className="mb-2 text-[10px] font-bold uppercase tracking-[.13em]" style={{ color: palette.muted }}>Cargos neste servidor</h2><div className="flex flex-wrap gap-1.5">{profile.assignedRoles?.map((role) => { const option = roles.find((item) => item.id === role.id); return canManageRoles && option ? <button key={role.id} type="button" onClick={() => onToggleRole?.(option, true)} title="Remover cargo" className="rounded-full border border-white/10 bg-white/[.06] px-2.5 py-1 text-[11px] font-semibold transition hover:border-red-400/40 hover:text-red-200">{role.name} ×</button> : <span key={role.id} className="rounded-full border border-white/10 bg-white/[.06] px-2.5 py-1 text-[11px] font-semibold">{role.name}</span>; })}{canManageRoles && roles.filter((role) => !profile.assignedRoles?.some((assigned) => assigned.id === role.id)).map((role) => <button key={role.id} type="button" onClick={() => onToggleRole?.(role, false)} className="rounded-full border border-dashed border-white/20 px-2.5 py-1 text-[11px] text-white/60 transition hover:border-white/50 hover:text-white">+ {role.name}</button>)}</div></div> : null}

            {profile.customStatus || profile.bio || profile.assignedRoles?.length ? <div className="my-4 border-t border-white/10" style={{ borderColor: palette.border }}/> : null}
            <ProfileConnections connections={connections} showAdd={isSelf}/>
            {onQuickMessage && !isSelf && <form onSubmit={(event) => void submitQuickMessage(event)} className="mt-4">
              <label className="sr-only" htmlFor="member-profile-quick-message">Mensagem rápida</label>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 focus-within:border-discord-brand"><input id="member-profile-quick-message" value={quickMessage} maxLength={4000} onChange={(event) => setQuickMessage(event.target.value)} placeholder={`Mensagem rápida para @${profile.username || profile.displayName}`} className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-white/45"/><button type="submit" disabled={!quickMessage.trim() || sendingMessage} aria-label="Enviar mensagem rápida" className="grid h-7 w-7 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-35"><SendHorizontal size={15}/></button></div>
              {quickMessageError && <p role="alert" className="mt-1 text-[11px] text-red-300">{quickMessageError}</p>}
            </form>}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 shrink-0 items-center justify-between border-b border-white/10 px-5 pr-14 sm:px-7 sm:pr-16" style={{ borderColor: palette.border }}>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-discord-brand">Perfil</p><p className="truncate text-sm font-semibold">{profile.displayName}</p></div>
            <div className="hidden items-center gap-2 text-[11px] text-white/50 sm:flex"><Users size={14}/>{mutualServers.length} servidor{mutualServers.length === 1 ? "" : "es"} em comum</div>
          </header>

          <div role="tablist" aria-label="Seções do perfil" className="flex shrink-0 gap-3 overflow-x-auto border-b border-white/10 px-5 sm:px-7" style={{ borderColor: palette.border }}>
            {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={cn("shrink-0 border-b-2 px-1 py-4 text-xs font-semibold transition", tab === item.id ? "border-discord-brand text-white" : "border-transparent text-white/55 hover:text-white/85")}>{item.label}<span className="ml-1.5 text-white/45">{item.id === "amigos" && mutualDataLoading ? "…" : item.id === "servidores" && mutualDataLoading ? "…" : item.count ?? ""}</span></button>)}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {tab === "atividade" && <div className="mx-auto max-w-2xl">
              <div className="mb-4"><h2 className="text-base font-bold">Atividade atual</h2><p className="mt-1 text-xs text-white/50">O que {isSelf ? "você está fazendo" : `${profile.displayName} está fazendo`} agora.</p></div>
              <div className="space-y-3">
                {gameActivity && <GameActivityCard activity={gameActivity}/>} 
                {listening && <SpotifyActivityCard activity={listening}/>} 
                {voiceActivity && <VoiceActivityCard activity={voiceActivity} onOpen={onOpenVoiceActivity ? () => { onClose(); onOpenVoiceActivity(voiceActivity); } : undefined}/>} 
                {!gameActivity && !listening && !voiceActivity && !profile.customStatus && <div className="rounded-xl border border-white/[.08] bg-black/15 px-5 py-10 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white/[.06] text-white/50"><Activity size={19}/></span><p className="mt-3 text-sm font-semibold">Nenhuma atividade compartilhada</p><p className="mt-1 text-xs text-white/50">As atividades aparecem aqui quando a pessoa as compartilha no Sekai.</p></div>}
                {profile.customStatus && !voiceActivity && <div className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-black/15 p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-discord-brand/15 text-discord-brand"><Activity size={18}/></span><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-white/50">Status</span><span className="mt-1 block break-words text-sm font-medium">{profile.customStatus}</span></span></div>}
              </div>
              <p className="mt-5 flex items-center gap-2 text-[11px] text-white/40"><Gamepad2 size={13}/>A atividade de jogo tem prioridade na lista de membros; nesta tela, jogo, Spotify e chamada aparecem juntos.</p>
            </div>}

            {tab === "amigos" && <div className="mx-auto max-w-2xl"><h2 className="mb-4 text-base font-bold">Amigos mútuos <span className="text-white/40">{mutualFriends.length}</span></h2>{mutualDataLoading ? <LoadingState/> : mutualFriends.length ? <div className="grid gap-2 sm:grid-cols-2">{mutualFriends.map((friend) => <div key={friend.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[.07] bg-black/15 p-3"><ProfileAvatar src={friend.avatarUrl} name={friend.name} size="h-10 w-10"/><span className="truncate text-sm font-semibold">{friend.name}</span></div>)}</div> : <EmptyState title="Nenhum amigo mútuo" description="Vocês ainda não têm amigos em comum."/>}</div>}

            {tab === "servidores" && <div className="mx-auto max-w-2xl"><h2 className="mb-4 text-base font-bold">Servidores mútuos <span className="text-white/40">{mutualServers.length}</span></h2>{mutualDataLoading ? <LoadingState/> : mutualServers.length ? <div className="grid gap-2 sm:grid-cols-2">{mutualServers.map((server) => <div key={server.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[.07] bg-black/15 p-3"><ProfileAvatar src={server.iconUrl} name={server.name} size="h-10 w-10" rounded="rounded-xl"/><span className="truncate text-sm font-semibold">{server.name}</span></div>)}</div> : <EmptyState title="Nenhum servidor mútuo" description="Vocês não compartilham nenhum servidor."/>}</div>}
          </div>
        </main>
      </section>

      {avatarPreview && <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/85 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setAvatarPreview(false); }}><button type="button" onClick={() => setAvatarPreview(false)} aria-label="Fechar foto" className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><X/></button>{profile.avatarUrl ? <CroppedProfileImage src={profile.avatarUrl} alt={profile.displayName} pauseGif={false} className="h-[min(72vh,560px)] w-[min(72vw,560px)] overflow-hidden rounded-full border-4 border-white/20 shadow-2xl"/> : <span className="grid h-64 w-64 place-items-center rounded-full bg-discord-brand text-8xl font-bold text-white">{profile.displayName[0]?.toUpperCase()}</span>}</div>}
    </div>,
    document.body,
  );
}

function SpotifyActivityCard({ activity }: { activity: NonNullable<ReturnType<typeof useNowPlaying>> }) {
  const artwork = safeSpotifyArtUrl(activity.artUrl);
  return <a href={activity.trackUrl || undefined} target={activity.trackUrl ? "_blank" : undefined} rel={activity.trackUrl ? "noreferrer" : undefined} className="flex min-w-0 items-center gap-4 rounded-xl border border-emerald-400/15 bg-gradient-to-r from-emerald-950/50 to-black/15 p-4 no-underline transition hover:border-emerald-400/25">
    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-emerald-500/15 shadow-lg">{artwork ? <img src={artwork} alt="" className="h-full w-full object-cover"/> : <SpotifyMark className="h-full w-full p-3"/>}</span>
    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-300"><Music2 size={13}/>Ouvindo Spotify</span><span className="mt-1 block truncate text-sm font-bold text-white">{activity.track}</span><span className="mt-0.5 block truncate text-xs text-white/60">{activity.artist}{activity.album ? ` · ${activity.album}` : ""}</span></span>
    <SpotifyMark className="h-6 w-6 shrink-0"/>
  </a>;
}

function VoiceActivityCard({ activity, onOpen }: { activity: MemberVoiceActivity; onOpen?: () => void }) {
  return <div className="rounded-xl border border-white/[.07] bg-[#191a1e] p-4"><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-white/55"><Headphones size={14}/>Em voz</div><div className="flex items-center gap-3"><div className="flex h-14 w-16 shrink-0 flex-wrap content-center justify-center gap-1 rounded-lg border border-white/[.08] bg-black/20 p-1">{activity.participants.slice(0, 4).map((person) => <ProfileAvatar key={person.id} src={person.avatarUrl} name={person.name} size="h-5 w-5"/> )}</div><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{activity.channelName}</span><span className="mt-0.5 block truncate text-xs text-white/55">em {activity.serverName} · {activity.participants.length} na chamada</span></span></div>{onOpen && <button type="button" onClick={onOpen} className="mt-3 rounded-lg border border-white/10 bg-white/[.06] px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10">Abrir chamada</button>}</div>;
}

function ProfileAvatar({ src, name, size, rounded = "rounded-full" }: { src?: string | null; name: string; size: string; rounded?: string }) {
  return <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-white/10 text-xs font-bold", size, rounded)}>{src ? <img src={src} alt="" className="h-full w-full object-cover"/> : name.slice(0, 1).toUpperCase()}</span>;
}

function LoadingState() {
  return <div className="rounded-xl border border-white/[.07] bg-black/15 px-5 py-8 text-center text-xs text-white/50">Carregando…</div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-xl border border-white/[.07] bg-black/15 px-5 py-8 text-center"><Users size={20} className="mx-auto text-white/35"/><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-white/50">{description}</p></div>;
}
