"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Hash,
  Music2,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  Settings,
  UserPlus,
  Plus,
  PhoneOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ThemePicker from "@/components/ThemePicker";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { CurrentUserProfileMenu } from "@/components/CurrentUserProfileMenu";
import type { CustomBadge } from "@/lib/badges";
import { createClient } from "@/lib/supabase/client";
import type { SoundboardEffect, VoiceAudioSettings, VoiceProfile } from "@/components/Controls";
import { ScreenShareIcon } from "@/components/icons";

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  categoryId: string | null;
  categoryName: string;
  position?: number;
  categoryPosition?: number;
  unread?: boolean;
  mentionCount?: number;
}

export interface ChannelCategory {
  id: string;
  name: string;
  position: number;
}

export interface VoiceMemberPreview {
  id: string;
  name: string;
  joinedAt?: number;
  avatarUrl?: string | null;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
}

interface ChannelSidebarProps {
  serverId: string;
  serverName: string;
  channels: Channel[];
  categories?: ChannelCategory[];
  activeChannelId?: string;
  onSelectChannel: (channelId: string) => void;
  onOpenServerMenu?: () => void;
  currentUser: {
    userId: string;
    username?: string;
    displayName: string;
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
    bio?: string | null;
    customStatus?: string | null;
    presence: "online" | "idle" | "dnd" | "offline";
    isMuted?: boolean;
    isDeafened?: boolean;
    isSpeaking?: boolean;
  };
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  voiceAudioSettings?: VoiceAudioSettings | null;
  onSelectVoiceInputDevice?: (deviceId: string) => void;
  onSelectVoiceOutputDevice?: (deviceId: string) => void;
  onVoiceInputVolumeChange?: (volume: number) => void;
  onVoiceOutputVolumeChange?: (volume: number) => void;
  onVoiceProfileChange?: (profile: VoiceProfile) => void;
  onOpenSettings?: () => void;
  onPresenceChange?: (presence: "online" | "idle" | "dnd" | "offline") => boolean | void | Promise<boolean | void>;
  canManageChannels?: boolean;
  canCreateInvite?: boolean;
  onCreateChannel?: (categoryId: string | null) => void;
  onCreateCategory?: () => void;
  onDeleteChannel?: (channel: Channel) => void;
  onEditChannel?: (channel: Channel) => void;
  onCreateChannelInvite?: (channel: Channel) => void;
  onReorderChannels?: (channels: Channel[]) => void;
  /** Canal de voz em que você está conectado agora (a chamada segue ativa em segundo plano). */
  connectedVoiceChannelId?: string | null;
  connectedVoiceChannelName?: string;
  connectedVoiceStartedAt?: number;
  connectedVoiceServerId?: string;
  connectedVoiceMembers?: VoiceMemberPreview[];
  voiceMembersByChannel?: Record<string, VoiceMemberPreview[]>;
  onPresentScreen?: () => void;
  onPlaySoundEffect?: (effect: SoundboardEffect) => Promise<boolean>;
  soundboardAudioReady?: boolean;
  onCloseMobileNav?: () => void;
  onDisconnectVoice?: () => void;
}

export function ChannelSidebar({
  serverId,
  serverName,
  channels,
  categories = [],
  activeChannelId,
  onSelectChannel,
  onOpenServerMenu,
  currentUser,
  onToggleMute,
  onToggleDeafen,
  voiceAudioSettings,
  onSelectVoiceInputDevice,
  onSelectVoiceOutputDevice,
  onVoiceInputVolumeChange,
  onVoiceOutputVolumeChange,
  onVoiceProfileChange,
  onOpenSettings,
  onPresenceChange,
  canManageChannels = false,
  canCreateInvite = false,
  onCreateChannel,
  onCreateCategory,
  onDeleteChannel,
  onEditChannel,
  onCreateChannelInvite,
  onReorderChannels,
  connectedVoiceChannelId,
  connectedVoiceChannelName,
  connectedVoiceStartedAt,
  connectedVoiceServerId,
  connectedVoiceMembers = [],
  voiceMembersByChannel = {},
  onPresentScreen,
  onPlaySoundEffect,
  soundboardAudioReady = false,
  onCloseMobileNav,
  onDisconnectVoice,
}: ChannelSidebarProps) {
  const supabase = createClient();
  const [clockNow, setClockNow] = useState(() => Date.now());
  const hasVoiceDurations = Boolean(connectedVoiceStartedAt || connectedVoiceMembers.some((member) => member.joinedAt) || Object.values(voiceMembersByChannel).some((members) => members.some((member) => member.joinedAt)));
  useEffect(() => {
    if (!hasVoiceDurations) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasVoiceDurations]);
  const orderedChannels = [...channels].sort((a, b) => (a.categoryPosition ?? 0) - (b.categoryPosition ?? 0) || (a.position ?? 0) - (b.position ?? 0));
  const categoryIds = new Set(categories.map((category) => category.id));
  const categorySections: ChannelCategory[] = [
    ...categories,
    ...Array.from(new Map<string, ChannelCategory>(orderedChannels.filter((channel) => channel.categoryId && !categoryIds.has(channel.categoryId)).map((channel): [string, ChannelCategory] => [channel.categoryId!, {
      id: channel.categoryId!,
      name: channel.categoryName,
      position: channel.categoryPosition ?? 0,
    }])).values()),
    ...(orderedChannels.some((channel) => !channel.categoryId) ? [{ id: "", name: "SEM CATEGORIA", position: Number.MAX_SAFE_INTEGER }] : []),
  ].sort((a, b) => a.position - b.position);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null);
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [voiceAudioMenuOpen, setVoiceAudioMenuOpen] = useState<"input" | "output" | null>(null);
  const [voiceSettingsExpanded, setVoiceSettingsExpanded] = useState(false);
  const [soundboardEffects, setSoundboardEffects] = useState<SoundboardEffect[]>([]);
  const [soundboardLoading, setSoundboardLoading] = useState(false);
  const [soundboardError, setSoundboardError] = useState("");
  const [soundboardMessage, setSoundboardMessage] = useState("");
  const presenceLabel = currentUser.presence === "online" ? "Online" : currentUser.presence === "idle" ? "Ausente" : currentUser.presence === "dnd" ? "Não perturbe" : "Invisível";

  useEffect(() => {
    let cancelled = false;
    setSoundboardEffects([]);
    setSoundboardError("");
    if (!serverId) {
      setSoundboardLoading(false);
      return () => { cancelled = true; };
    }

    setSoundboardLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("server_assets")
          .select("id,name,asset_url")
          .eq("server_id", serverId)
          .eq("kind", "sound")
          .order("name", { ascending: true });
        if (cancelled) return;
        if (error) {
          console.warn("Não foi possível carregar os efeitos sonoros do servidor:", error.message);
          setSoundboardError("Não foi possível carregar os sons deste servidor.");
          return;
        }
        setSoundboardEffects((data ?? []).map((row) => ({ id: row.id, name: row.name, assetUrl: row.asset_url })));
      } catch (error) {
        if (!cancelled) {
          console.warn("Não foi possível carregar os efeitos sonoros do servidor:", error);
          setSoundboardError("Não foi possível carregar os sons deste servidor.");
        }
      } finally {
        if (!cancelled) setSoundboardLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [serverId, supabase]);

  function dropChannel(target: Channel, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const source = channels.find((channel) => channel.id === draggedChannelId);
    if (!source || source.id === target.id || !canManageChannels) return;
    const moved = { ...source, categoryId: target.categoryId, categoryName: target.categoryName, categoryPosition: target.categoryPosition };
    const next = channels.filter((channel) => channel.id !== source.id);
    const targetIndex = next.findIndex((channel) => channel.id === target.id);
    const insertIndex = targetIndex + (event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.clientHeight / 2 ? 1 : 0);
    next.splice(Math.max(0, insertIndex), 0, moved);
    onReorderChannels?.(next);
    setDraggedChannelId(null);
  }

  async function playSoundboardEffect(effect: SoundboardEffect) {
    if (!onPlaySoundEffect) return;
    setSoundboardMessage(`Enviando “${effect.name}”…`);
    try {
      const sent = await onPlaySoundEffect(effect);
      setSoundboardMessage(sent ? `“${effect.name}” enviado para os membros online do servidor.` : "Não foi possível enviar o efeito. Tente novamente.");
    } catch (error) {
      console.warn("Não foi possível enviar o efeito sonoro:", error);
      setSoundboardMessage(error instanceof Error ? error.message : "Não foi possível enviar o efeito.");
    }
    window.setTimeout(() => setSoundboardMessage(""), 3500);
  }

  return (
    <div className="server-view-enter flex h-full w-[min(15rem,calc(100vw-6rem))] shrink-0 flex-col bg-discord-bg-dark md:w-60">
      {/* Cabeçalho do servidor */}
      <div className="bg-theme-wash flex h-12 shrink-0 items-center border-b border-black/20 px-3 shadow-sm">
        <button onClick={onOpenServerMenu} className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 text-left hover:brightness-125">
          <span className="truncate font-semibold text-discord-header-primary">{serverName}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-discord-text-muted" />
        </button>
        {onCloseMobileNav && <button type="button" onClick={onCloseMobileNav} aria-label="Fechar navegação" className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-discord-text-muted hover:bg-white/10 hover:text-white md:hidden"><X className="h-5 w-5"/></button>}
      </div>

      {/* Lista de canais */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-2 py-3">
        {categorySections.map((category) => {
          const sectionKey = category.id || "__uncategorized__";
          const isCollapsed = collapsed[sectionKey];
          const categoryChannels = orderedChannels.filter((channel) => category.id ? channel.categoryId === category.id : !channel.categoryId);
          const categoryId = category.id || null;

          return (
            <div key={sectionKey} className="border-b border-white/[0.07] pb-2.5 last:border-b-0">
              <div className="group flex items-center justify-between rounded-md bg-black/[0.08] px-1 py-1">
                <button
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
                  }
                  className="flex min-h-10 flex-1 items-center gap-1 text-sm font-semibold uppercase tracking-wide text-discord-text-muted hover:text-discord-header-primary md:min-h-0 md:text-xs"
                >
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")}
                  />
                  {category.name}
                </button>
                {canManageChannels && (
                  <button
                    onClick={() => onCreateChannel?.(categoryId)}
                    title="Criar canal"
                    className="rounded p-0.5 text-discord-text-muted opacity-0 hover:text-discord-header-primary group-hover:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div className="mt-1 space-y-[2px]">
                  {categoryChannels.map((channel) => {
                    const active = channel.id === activeChannelId;
                    const savedVoiceMembers = voiceMembersByChannel[channel.id] ?? [];
                    const channelLiveMembers = channel.id === connectedVoiceChannelId ? connectedVoiceMembers : [];
                    const liveMembersById = new Map(channelLiveMembers.map((member) => [member.id, member] as const));
                    const savedMemberIds = new Set(savedVoiceMembers.map((member) => member.id));
                    const voiceMembers = [
                      ...savedVoiceMembers.map((member) => {
                        const liveMember = liveMembersById.get(member.id);
                        return liveMember ? { ...member, ...liveMember, joinedAt: liveMember.joinedAt ?? member.joinedAt, avatarUrl: liveMember.avatarUrl ?? member.avatarUrl } : member;
                      }),
                      ...channelLiveMembers.filter((member) => !savedMemberIds.has(member.id)),
                    ];
                    const hasVoiceMembers = channel.type === "voice" && (voiceMembers.length > 0 || channel.id === connectedVoiceChannelId);
                    return (
                      <div
                        key={channel.id}
                        draggable={canManageChannels}
                        onDragStart={(event) => { setDraggedChannelId(channel.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", channel.id); }}
                        onDragEnd={() => setDraggedChannelId(null)}
                        onDragOver={(event) => { if (canManageChannels && draggedChannelId) event.preventDefault(); }}
                        onDrop={(event) => dropChannel(channel, event)}
                        onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, channel }); }}
                        className={cn("group/channel flex min-w-0 flex-col rounded-md transition", draggedChannelId === channel.id && "opacity-40", canManageChannels && "cursor-grab active:cursor-grabbing")}
                      >
                        <div className="flex min-w-0 items-center rounded-md">
                          <button
                            onClick={() => onSelectChannel(channel.id)}
                            className={cn(
                              "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-[15px] font-medium md:min-h-0 md:gap-1.5 md:py-1.5 md:text-sm",
                              active
                                ? "bg-discord-bg-modifier-hover text-discord-header-primary"
                                : channel.unread || channel.mentionCount
                                  ? "font-semibold text-discord-header-primary hover:bg-discord-bg-modifier-hover"
                                  : "text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-text-normal"
                            )}
                          >
                            {channel.type === "text" ? (
                              <Hash className="h-4 w-4 shrink-0" />
                            ) : (
                              <Volume2 className="h-4 w-4 shrink-0" style={hasVoiceMembers ? { color: "var(--sekai-link, rgb(var(--d-brand)))" } : undefined} />
                            )}
                            <span className="truncate">{channel.name}</span>
                            {(hasVoiceMembers || channel.mentionCount || channel.unread) && <span className="ml-auto flex shrink-0 items-center gap-1">
                              {hasVoiceMembers && <><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--sekai-link, rgb(var(--d-brand)))" }} title="Há pessoas na chamada" />{voiceMembers[0]?.joinedAt && <span className="text-[10px] tabular-nums" style={{ color: "var(--sekai-link, rgb(var(--d-brand)))" }}>{formatVoiceDuration(clockNow - voiceMembers[0].joinedAt)}</span>}</>}
                              {channel.mentionCount ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-discord-danger px-1 text-[10px] font-bold leading-none text-white">{channel.mentionCount > 99 ? "99+" : channel.mentionCount}</span> : channel.unread ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                            </span>}
                          </button>
                          {(canCreateInvite || canManageChannels) && <div className={cn("flex shrink-0 items-center gap-0.5 pr-1", active ? "opacity-100" : "opacity-0 transition-opacity group-hover/channel:opacity-100 focus-within:opacity-100")}>
                            {canCreateInvite && <button type="button" onClick={() => onCreateChannelInvite?.(channel)} title="Convidar para este canal" aria-label={`Convidar para ${channel.name}`} className="rounded p-1 text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-header-primary"><UserPlus className="h-3.5 w-3.5"/></button>}
                            {canManageChannels && <button type="button" onClick={() => onEditChannel?.(channel)} title="Configurações do canal" aria-label={`Configurações de ${channel.name}`} className="rounded p-1 text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-header-primary"><Settings className="h-3.5 w-3.5"/></button>}
                          </div>}
                        </div>
                        {channel.type === "voice" && voiceMembers.length > 0 && (
                          <div className="ml-5 mt-0.5 min-w-0 space-y-0.5 py-1 pl-2">
                            {voiceMembers.map((member) => (
                              <div key={member.id} className="flex min-h-8 min-w-0 items-center gap-1.5 md:min-h-7">
                                <div className={`h-5 w-5 shrink-0 overflow-hidden rounded-full bg-discord-brand text-center text-[10px] leading-5 text-white ${member.isSpeaking ? "voice-speaking-avatar" : ""}`}>
                                  {member.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
                                  ) : member.name[0]?.toUpperCase()}
                                </div>
                                <span className="min-w-0 flex-1 truncate text-xs text-discord-text-normal md:text-[11px]">{member.name}</span>
                                {member.isMuted && <MicOff className="h-3.5 w-3.5 shrink-0 text-discord-danger" aria-label="Microfone mutado" />}
                                {member.isDeafened && <Headphones className="h-3.5 w-3.5 shrink-0 text-discord-danger" aria-label="Ensurdecido" />}
                                {member.joinedAt && <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--sekai-link, rgb(var(--d-brand)))" }}>{formatVoiceDuration(clockNow - member.joinedAt)}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {canManageChannels && (
          <button
            onClick={onCreateCategory}
            className="flex min-h-10 w-full items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-discord-text-muted hover:text-discord-header-primary md:min-h-0 md:text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Criar categoria
          </button>
        )}
      </div>

      {contextMenu && <><button aria-label="Fechar opções do canal" className="fixed inset-0 z-40 cursor-default" onClick={() => setContextMenu(null)} /><div style={{ left: Math.min(contextMenu.x, window.innerWidth - 205), top: Math.min(contextMenu.y, window.innerHeight - 130) }} className="fixed z-50 w-48 rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 shadow-2xl"><p className="px-3 py-2 text-xs font-semibold text-discord-text-muted">#{contextMenu.channel.name}</p>{canCreateInvite && <button onClick={() => { onCreateChannelInvite?.(contextMenu.channel); setContextMenu(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover">Criar convite do canal</button>}{canManageChannels && <><button onClick={() => { onEditChannel?.(contextMenu.channel); setContextMenu(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover">Configurações do canal</button><button onClick={() => { onDeleteChannel?.(contextMenu.channel); setContextMenu(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Excluir canal</button></>}</div></>}

      {/* Acesso ao soundboard sempre disponível, com ou sem chamada. */}
      <div className="relative border-t border-white/[0.06] bg-discord-bg-darkest px-3 py-2">
        <button
          type="button"
          onClick={() => setSoundboardOpen((open) => !open)}
          aria-label="Abrir efeitos sonoros do servidor"
          aria-expanded={soundboardOpen}
          title="Efeitos sonoros do servidor"
          className={cn("flex min-h-10 w-full items-center gap-2 rounded-lg border px-2.5 text-left transition", soundboardOpen ? "border-discord-brand/50 bg-discord-brand/15 text-white" : "border-white/[0.07] bg-white/[0.035] text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-white")}
        >
          <Music2 className="h-4 w-4 shrink-0 text-discord-brand" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">Efeitos sonoros</span>
            <span className="block truncate text-[10px] text-discord-text-muted">Para membros online do servidor</span>
          </span>
          <span className="text-[10px] text-discord-text-muted">{soundboardEffects.length}</span>
        </button>
        {soundboardOpen && <div className="absolute bottom-full left-2 right-2 z-[80] mb-2 overflow-hidden rounded-xl border border-white/10 bg-discord-bg-floating p-2.5 shadow-2xl">
          <div className="mb-2 flex items-center justify-between px-1"><p className="text-xs font-semibold text-discord-header-primary">Efeitos sonoros</p><span className="text-[10px] text-discord-text-muted">{soundboardEffects.length}</span></div>
          {soundboardLoading ? <p className="rounded-lg bg-black/15 px-3 py-4 text-center text-[11px] text-discord-text-muted">Carregando sons…</p> : soundboardError ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-4 text-center text-[11px] text-red-200">{soundboardError}</p> : soundboardEffects.length === 0 ? <p className="rounded-lg bg-black/15 px-3 py-4 text-center text-[11px] leading-relaxed text-discord-text-muted">Nenhum efeito cadastrado neste servidor. Adicione em Configurações → Painel de efeitos sonoros.</p> : <div className="max-h-56 space-y-1 overflow-y-auto">{soundboardEffects.map((effect) => <button key={effect.id} type="button" onClick={() => void playSoundboardEffect(effect)} disabled={!onPlaySoundEffect} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-discord-text-normal transition hover:bg-discord-brand/15 hover:text-white disabled:opacity-50"><Music2 className="h-3.5 w-3.5 shrink-0 text-discord-brand"/><span className="truncate">{effect.name}</span></button>)}</div>}
          {soundboardMessage && <p role="status" className="mt-2 px-1 text-[10px] text-emerald-300">{soundboardMessage}</p>}
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-discord-text-muted">O som chega aos membros online com o Sekai aberto, dentro ou fora da chamada. {soundboardAudioReady ? "Áudio liberado neste navegador." : "Cada pessoa precisa interagir com o Sekai uma vez para liberar áudio no navegador."}</p>
        </div>}
      </div>

      {/* Barra de chamada conectada (como no Discord) */}
      {connectedVoiceChannelId && (
        <div className="border-t border-black/20 bg-discord-bg-darkest px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold md:text-xs" style={{ color: "var(--sekai-link, rgb(var(--d-brand)))" }}><Volume2 className="h-4 w-4 md:h-3.5 md:w-3.5"/>Voz conectada{connectedVoiceStartedAt && <span className="ml-auto text-[10px] tabular-nums">{formatVoiceDuration(clockNow - connectedVoiceStartedAt)}</span>}</p>
              <p className="truncate pl-5 text-xs text-discord-text-muted md:text-[11px]">{connectedVoiceChannelName ?? "Canal de voz"}</p>
            </div>
            {onToggleMute && <div className="relative flex items-center">
              <button onClick={onToggleMute} title={currentUser.isMuted ? "Ativar microfone" : "Mutar microfone"} aria-label={currentUser.isMuted ? "Ativar microfone" : "Mutar microfone"} aria-pressed={currentUser.isMuted} className={cn("grid h-11 w-10 place-items-center rounded-l-xl transition hover:bg-discord-bg-modifier-hover md:h-10 md:w-10 md:rounded-l-lg", currentUser.isMuted ? "text-discord-danger" : "text-discord-text-muted hover:text-white")}>{currentUser.isMuted ? <MicOff className="h-5 w-5"/> : <Mic className="h-5 w-5"/>}</button>
              <button type="button" onClick={() => setVoiceAudioMenuOpen((open) => open === "input" ? null : "input")} aria-label="Opções do microfone" aria-expanded={voiceAudioMenuOpen === "input"} className="grid h-11 w-10 place-items-center rounded-r-xl text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-white md:h-10 md:w-9 md:rounded-r-lg"><ChevronDown className={cn("h-4 w-4 transition-transform", voiceAudioMenuOpen === "input" && "rotate-180")}/></button>
              {voiceAudioMenuOpen === "input" && <div className="absolute bottom-full left-0 z-[100] mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-discord-bg-floating p-3 text-discord-text-normal shadow-2xl">
                <p className="px-1 text-xs font-semibold">Dispositivo de entrada</p>
                <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">{voiceAudioSettings?.inputDevices.length ? voiceAudioSettings.inputDevices.map((device) => <button key={device.deviceId} type="button" onClick={() => onSelectVoiceInputDevice?.(device.deviceId)} className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-discord-bg-modifier-hover", voiceAudioSettings?.selectedInputDeviceId === device.deviceId && "bg-discord-brand/15 text-white")}><span className="truncate">{device.label}</span>{voiceAudioSettings?.selectedInputDeviceId === device.deviceId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-discord-brand"/>}</button>) : <p className="px-2 py-2 text-xs text-discord-text-muted">Carregando microfones…</p>}</div>
                <div className="my-2 border-t border-white/[0.08]"/>
                <button type="button" onClick={() => setVoiceSettingsExpanded((expanded) => !expanded)} aria-expanded={voiceSettingsExpanded} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-discord-bg-modifier-hover"><span><span className="block text-xs font-semibold">Perfil de entrada</span><span className="mt-0.5 block text-[11px] text-discord-text-muted">{voiceAudioSettings?.voiceProfile === "noise-suppression" ? "Supressão de ruído" : "Padrão"}</span></span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", voiceSettingsExpanded && "rotate-180")}/></button>
                {voiceSettingsExpanded && <div className="mt-1 space-y-1">{(["standard", "noise-suppression"] as VoiceProfile[]).map((profile) => <button key={profile} type="button" onClick={() => onVoiceProfileChange?.(profile)} className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-discord-bg-modifier-hover", voiceAudioSettings?.voiceProfile === profile && "bg-discord-brand/15 text-white")}><span>{profile === "standard" ? "Padrão" : "Supressão de ruído"}</span>{voiceAudioSettings?.voiceProfile === profile && <span className="h-1.5 w-1.5 rounded-full bg-discord-brand"/>}</button>)}</div>}
                <label className="mt-2 block border-t border-white/[0.08] pt-3"><span className="flex justify-between text-xs font-semibold"><span>Volume de entrada</span><span className="text-discord-text-muted">{Math.round((voiceAudioSettings?.inputVolume ?? 1) * 100)}%</span></span><input aria-label="Volume de entrada do microfone" type="range" min="0" max="2" step="0.01" value={voiceAudioSettings?.inputVolume ?? 1} onChange={(event) => onVoiceInputVolumeChange?.(Number(event.target.value))} className="mt-2 w-full" style={{ accentColor: "rgb(var(--d-brand))" }}/></label>
                <button type="button" onClick={() => setVoiceSettingsExpanded((expanded) => !expanded)} aria-expanded={voiceSettingsExpanded} className="mt-2 flex w-full items-center gap-2 border-t border-white/[0.08] px-2 pt-3 text-left text-xs font-semibold hover:text-white"><Settings className="h-4 w-4"/>Configurações de voz</button>
              </div>}
            </div>}
            {onToggleDeafen && <div className="relative flex items-center">
              <button onClick={onToggleDeafen} title={currentUser.isDeafened ? "Reativar áudio" : "Ensurdecer"} aria-label={currentUser.isDeafened ? "Reativar áudio" : "Ensurdecer"} aria-pressed={currentUser.isDeafened} className={cn("grid h-11 w-10 place-items-center rounded-l-xl transition hover:bg-discord-bg-modifier-hover md:h-10 md:w-10 md:rounded-l-lg", currentUser.isDeafened ? "text-discord-danger" : "text-discord-text-muted hover:text-white")}><Headphones className="h-5 w-5"/></button>
              <button type="button" onClick={() => setVoiceAudioMenuOpen((open) => open === "output" ? null : "output")} aria-label="Opções da saída de áudio" aria-expanded={voiceAudioMenuOpen === "output"} className="grid h-11 w-10 place-items-center rounded-r-xl text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-white md:h-10 md:w-9 md:rounded-r-lg"><ChevronDown className={cn("h-4 w-4 transition-transform", voiceAudioMenuOpen === "output" && "rotate-180")}/></button>
              {voiceAudioMenuOpen === "output" && <div className="absolute bottom-full left-0 z-[100] mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-discord-bg-floating p-3 text-discord-text-normal shadow-2xl">
                <p className="px-1 text-xs font-semibold">Dispositivo de saída</p>
                {!voiceAudioSettings?.outputDeviceSelectionSupported ? <p className="mt-2 rounded-lg bg-black/15 px-2 py-2 text-xs leading-relaxed text-discord-text-muted">Este navegador usa a saída padrão do sistema e não permite escolhê-la pelo Sekai.</p> : <div className="mt-2 max-h-28 space-y-1 overflow-y-auto"><button type="button" onClick={() => onSelectVoiceOutputDevice?.("")} className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-discord-bg-modifier-hover", !voiceAudioSettings?.selectedOutputDeviceId && "bg-discord-brand/15 text-white")}>Padrão do sistema{!voiceAudioSettings?.selectedOutputDeviceId && <span className="h-1.5 w-1.5 rounded-full bg-discord-brand"/>}</button>{(voiceAudioSettings?.outputDevices ?? []).filter((device) => device.deviceId !== "default").map((device) => <button key={device.deviceId} type="button" onClick={() => onSelectVoiceOutputDevice?.(device.deviceId)} className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-discord-bg-modifier-hover", voiceAudioSettings?.selectedOutputDeviceId === device.deviceId && "bg-discord-brand/15 text-white")}><span className="truncate">{device.label}</span>{voiceAudioSettings?.selectedOutputDeviceId === device.deviceId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-discord-brand"/>}</button>)}</div>}
                <label className="mt-2 block border-t border-white/[0.08] pt-3"><span className="flex justify-between text-xs font-semibold"><span>Volume de saída</span><span className="text-discord-text-muted">{Math.round((voiceAudioSettings?.outputVolume ?? 1) * 100)}%</span></span><input aria-label="Volume de saída" type="range" min="0" max="1" step="0.01" value={voiceAudioSettings?.outputVolume ?? 1} onChange={(event) => onVoiceOutputVolumeChange?.(Number(event.target.value))} className="mt-2 w-full" style={{ accentColor: "rgb(var(--d-brand))" }}/></label>
              </div>}
            </div>}
            <button
              onClick={onDisconnectVoice}
              title="Desconectar da chamada"
              aria-label="Desconectar da chamada"
              className="rounded-md p-1.5 text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-danger"
            >
              <PhoneOff className="h-[18px] w-[18px]" />
            </button>
          </div>
          {connectedVoiceServerId && (
            <div className="mt-2 flex items-center gap-1.5 border-t border-white/[0.06] pt-2">
              <button
                type="button"
                onClick={onPresentScreen}
                disabled={!onPresentScreen}
                title="Apresentar tela na chamada"
                aria-label="Apresentar tela na chamada"
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.035] text-xs font-medium text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ScreenShareIcon active={false} />
                Apresentar tela
              </button>
            </div>
          )}
        </div>
      )}

      {/* Painel do usuário */}
      <CurrentUserProfileMenu user={currentUser} onOpenSettings={onOpenSettings} onPresenceChange={onPresenceChange}>
      {({ toggle, openSettings, isOpen, triggerRef }) => <div ref={triggerRef} className="profile-footer group relative flex h-[52px] items-center gap-2 rounded-lg border border-transparent bg-discord-bg-darkest px-2 transition-colors duration-200 hover:border-white/5 hover:bg-discord-bg-modifier-hover/70 focus-within:border-white/10">
        <button onClick={toggle} aria-label="Abrir menu do perfil" aria-expanded={isOpen} className={`relative h-8 w-8 shrink-0 rounded-full bg-discord-brand ring-offset-2 ring-offset-discord-bg-darkest transition hover:ring-2 hover:ring-discord-brand ${currentUser.isSpeaking ? "voice-speaking-avatar" : ""}`}>
          <span className="absolute inset-0 overflow-hidden rounded-full">
            {currentUser.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <CroppedProfileImage src={currentUser.avatarUrl} alt="" className="rounded-full" positionX={currentUser.avatarPositionX} positionY={currentUser.avatarPositionY} zoom={currentUser.avatarZoom} />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                {currentUser.displayName[0]?.toUpperCase()}
              </span>
            )}
          </span>
          <PresenceIndicator presence={currentUser.presence} avatarBadge borderColor="rgb(var(--d-darkest))" cutoutColor="rgb(var(--d-darkest))" />
        </button>

        <button onClick={toggle} aria-expanded={isOpen} className="profile-footer-name min-w-0 flex-1 rounded-md py-1 text-left">
          <p className="truncate text-sm font-semibold text-discord-header-primary">{currentUser.displayName}</p>
          <p className="profile-footer-subline relative h-4 truncate text-xs text-discord-text-muted">
            <span className="profile-footer-status absolute inset-0 truncate">{currentUser.customStatus || presenceLabel}</span>
            <span className="profile-footer-username absolute inset-0 truncate">{currentUser.username || currentUser.userId.slice(0, 8)}</span>
          </p>
        </button>

        <div className="profile-footer-actions flex items-center gap-0.5">
          <ThemePicker placement="up" align="left" />

          <button
            onClick={openSettings}
            title="Configurações"
            aria-label="Abrir configurações"
            className="rounded-md p-1.5 text-discord-text-muted transition-colors hover:bg-discord-bg-modifier-hover hover:text-discord-text-normal"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>}
      </CurrentUserProfileMenu>
    </div>
  );
}

function formatVoiceDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

