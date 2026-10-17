"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Hash,
  Music2,
  Volume2,
  MicOff,
  Headphones,
  Settings,
  UserPlus,
  Plus,
  PhoneOff,
  X,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ThemePicker from "@/components/ThemePicker";
import AnchoredPopover from "@/components/AnchoredPopover";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { moveChannel, useChannelReorder } from "@/lib/useChannelReorder";
import { HoverGifImage } from "@/components/HoverGifImage";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { CurrentUserProfileMenu } from "@/components/CurrentUserProfileMenu";
import type { CustomBadge } from "@/lib/badges";
import { createClient } from "@/lib/supabase/client";
import type { SoundboardEffect, VoiceAudioSettings, VoiceProfile } from "@/components/Controls";
import { voiceProfileLabel } from "@/lib/voicePreferences";
import { CamIcon, MicIcon, ScreenShareIcon } from "@/components/icons";
import packageJson from "../package.json";

/** Banners já resolvidos por servidor: trocar de servidor não pisca nem refaz a consulta. */
const serverBannerCache = new Map<string, string | null>();
const decodedBannerUrls = new Set<string>();

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
    isCameraOn?: boolean;
    isSpeaking?: boolean;
  };
  onToggleMute?: () => void;
  onToggleCamera?: () => void;
  onToggleDeafen?: () => void;
  voiceAudioSettings?: VoiceAudioSettings | null;
  onSelectVoiceInputDevice?: (deviceId: string) => void;
  onSelectVoiceOutputDevice?: (deviceId: string) => void;
  onVoiceInputVolumeChange?: (volume: number) => void;
  onVoiceOutputVolumeChange?: (volume: number) => void;
  onVoiceProfileChange?: (profile: VoiceProfile) => void;
  onOpenSettings?: () => void;
  onViewProfile?: () => void;
  onOpenVoiceSettings?: () => void;
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
  connectedVoicePingMs?: number | null;
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
  onToggleCamera,
  onToggleDeafen,
  voiceAudioSettings,
  onSelectVoiceInputDevice,
  onSelectVoiceOutputDevice,
  onVoiceInputVolumeChange,
  onVoiceOutputVolumeChange,
  onVoiceProfileChange,
  onOpenSettings,
  onViewProfile,
  onOpenVoiceSettings,
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
  connectedVoicePingMs,
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
  const [voiceAudioMenuOpen, setVoiceAudioMenuOpen] = useState<"input" | "output" | null>(null);
  const [voiceProfileMenuOpen, setVoiceProfileMenuOpen] = useState(false);
  const voiceInputAnchorRef = useRef<HTMLDivElement>(null);
  const voiceOutputAnchorRef = useRef<HTMLDivElement>(null);
  const hasVoiceDurations = Boolean(connectedVoiceStartedAt || connectedVoiceMembers.some((member) => member.joinedAt) || Object.values(voiceMembersByChannel).some((members) => members.some((member) => member.joinedAt)));
  useEffect(() => {
    if (!hasVoiceDurations) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasVoiceDurations]);
  useEffect(() => {
    setVoiceAudioMenuOpen(null);
    setVoiceProfileMenuOpen(false);
  }, [connectedVoiceChannelId]);
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
  const reorder = useChannelReorder({ enabled: Boolean(canManageChannels), channels: orderedChannels, onReorder: onReorderChannels, move: moveChannel, gap: 2 });
  const [bannerUrl, setBannerUrl] = useState<string | null>(() => serverBannerCache.get(serverId) ?? null);
  const [bannerReady, setBannerReady] = useState(() => { const cached = serverBannerCache.get(serverId); return Boolean(cached && decodedBannerUrls.has(cached)); });
  const [headerHover, setHeaderHover] = useState(false);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("servers").select("banner_url").eq("id", serverId).maybeSingle();
      if (cancelled) return;
      // Coluna ausente (migração não aplicada) ou sem permissão: segue sem banner.
      const url = error ? null : ((data?.banner_url as string | null | undefined) ?? null);
      serverBannerCache.set(serverId, url);
      setBannerUrl(url);
    })();
    const onBannerChange = (event: Event) => {
      const detail = (event as CustomEvent<{ serverId?: string; url?: string | null }>).detail;
      if (detail?.serverId !== serverId) return;
      serverBannerCache.set(serverId, detail.url ?? null);
      setBannerUrl(detail.url ?? null);
    };
    window.addEventListener("sekai-server-banner-change", onBannerChange);
    return () => { cancelled = true; window.removeEventListener("sekai-server-banner-change", onBannerChange); };
  }, [serverId, supabase]);

  // Só expande o cabeçalho depois que a imagem decodificou: sem salto nem quadro vazio.
  useEffect(() => {
    if (!bannerUrl) { setBannerReady(false); return; }
    if (decodedBannerUrls.has(bannerUrl)) { setBannerReady(true); return; }
    setBannerReady(false);
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => { decodedBannerUrls.add(bannerUrl); if (!cancelled) setBannerReady(true); };
    probe.onerror = () => { if (!cancelled) setBannerUrl(null); };
    probe.src = bannerUrl;
    return () => { cancelled = true; probe.onload = null; probe.onerror = null; };
  }, [bannerUrl]);
  const hasBanner = Boolean(bannerUrl) && bannerReady;
  const [soundboardOpen, setSoundboardOpen] = useState(false);
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
      {/* Cabeçalho do servidor: com banner (GIF anima ao passar o mouse), como no Discord */}
      <div
        data-has-banner={hasBanner || undefined}
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
        onFocusCapture={() => setHeaderHover(true)}
        onBlurCapture={() => setHeaderHover(false)}
        className={cn("server-header relative shrink-0 overflow-hidden border-b border-black/20 shadow-sm", hasBanner ? "server-header-banner h-[6.5rem]" : "bg-theme-wash h-12")}
      >
        {hasBanner && bannerUrl && <>
          <HoverGifImage src={bannerUrl} alt="" isHovered={headerHover} className="server-banner-image absolute inset-0 h-full w-full object-cover" />
          <div aria-hidden="true" className="server-banner-scrim pointer-events-none absolute inset-0" />
        </>}
        <div className={cn("relative z-10 flex items-center px-3", hasBanner ? "absolute inset-x-0 top-0 h-12" : "h-12")}>
          <button onClick={onOpenServerMenu} aria-haspopup="menu" className={cn("server-header-button flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md py-2 text-left", hasBanner ? "-mx-1 px-1 text-white" : "hover:brightness-125")}>
            <span className={cn("truncate font-semibold", hasBanner ? "text-[15px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]" : "text-discord-header-primary")}>{serverName}</span>
            <ChevronDown className={cn("server-header-chevron h-4 w-4 shrink-0", hasBanner ? "text-white drop-shadow" : "text-discord-text-muted")} />
          </button>
          {onCloseMobileNav && <button type="button" onClick={onCloseMobileNav} aria-label="Fechar navegação" className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-discord-text-muted hover:bg-white/10 hover:text-white md:hidden"><X className="h-5 w-5"/></button>}
        </div>
      </div>

      {/* Lista de canais */}
      <div ref={reorder.containerRef} data-reorder-scroll className="relative flex-1 space-y-2.5 overflow-y-auto px-2 py-3">
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
                  className="sidebar-press flex min-h-10 flex-1 items-center gap-1 rounded-sm text-sm font-semibold uppercase tracking-wide text-discord-text-muted transition-colors hover:text-discord-header-primary md:min-h-0 md:text-xs"
                >
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform duration-200", isCollapsed && "-rotate-90")}
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
                <div className="channel-list-enter mt-1 space-y-[2px]">
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
                    const voiceDurationStart = channel.id === connectedVoiceChannelId && connectedVoiceStartedAt != null
                      ? connectedVoiceStartedAt
                      : voiceMembers[0]?.joinedAt;
                    return (
                      <div
                        key={channel.id}
                        {...reorder.rowProps(channel.id)}
                        className={cn("channel-row group/channel flex min-w-0 flex-col rounded-md", canManageChannels && "cursor-pointer")}
                      >
                        <div className="flex min-w-0 items-center rounded-md">
                          <button
                            onClick={() => onSelectChannel(channel.id)}
                            onKeyDown={(event) => reorder.onKeyboardMove(event, channel.id)}
                            className={cn(
                              "sidebar-press flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-[15px] font-medium md:min-h-0 md:gap-1.5 md:py-1.5 md:text-sm",
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
                              <Volume2 className="h-4 w-4 shrink-0" style={hasVoiceMembers ? { color: "var(--sekai-detail-accent, var(--sekai-logo-accent))" } : undefined} />
                            )}
                            <span className="truncate">{channel.name}</span>
                            {(hasVoiceMembers || channel.mentionCount || channel.unread) && <span className="ml-auto flex shrink-0 items-center gap-1">
                              {hasVoiceMembers && <><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--sekai-detail-accent, var(--sekai-logo-accent))" }} title="Há pessoas na chamada" />{voiceDurationStart != null && <span className="text-[10px] tabular-nums" style={{ color: "var(--sekai-detail-accent, var(--sekai-logo-accent))" }}>{formatVoiceDuration(clockNow - voiceDurationStart)}</span>}</>}
                              {channel.mentionCount ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-discord-danger px-1 text-[10px] font-bold leading-none text-white">{channel.mentionCount > 99 ? "99+" : channel.mentionCount}</span> : channel.unread ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                            </span>}
                          </button>
                          {(canCreateInvite || canManageChannels) && <div data-no-drag className={cn("flex shrink-0 items-center gap-0.5 pr-1", active ? "opacity-100" : "opacity-0 transition-opacity group-hover/channel:opacity-100 focus-within:opacity-100")}>
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
                                    <img src={member.avatarUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                                  ) : member.name[0]?.toUpperCase()}
                                </div>
                                <span className="min-w-0 flex-1 truncate text-xs text-discord-text-normal md:text-[11px]">{member.name}</span>
                                {member.isMuted && <MicOff className="h-3.5 w-3.5 shrink-0 text-discord-danger" aria-label="Microfone mutado" />}
                                {member.isDeafened && <Headphones className="h-3.5 w-3.5 shrink-0 text-discord-danger" aria-label="Ensurdecido" />}
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

      {contextMenu && createPortal(
        <>
          <button aria-label="Fechar opções do canal" className="fixed inset-0 z-[299] cursor-default" onClick={() => setContextMenu(null)} />
          <div
            style={{
              left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 200)),
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 176)),
            }}
            className="menu-pop-enter fixed z-[300] max-h-[calc(100dvh-16px)] w-[min(192px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 shadow-2xl"
          >
            <p className="px-3 py-2 text-xs font-semibold text-discord-text-muted">#{contextMenu.channel.name}</p>
            {canCreateInvite && <button onClick={() => { onCreateChannelInvite?.(contextMenu.channel); setContextMenu(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover">Criar convite do canal</button>}
            {canManageChannels && <>
              <button onClick={() => { onEditChannel?.(contextMenu.channel); setContextMenu(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover">Configurações do canal</button>
              <button onClick={() => { onDeleteChannel?.(contextMenu.channel); setContextMenu(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Excluir canal</button>
            </>}
          </div>
        </>,
        document.body,
      )}

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
        {reorder.indicator && <div aria-hidden="true" className="reorder-drop-indicator pointer-events-none absolute z-40" style={{ margin: 0, transform: `translate3d(${reorder.indicator.left}px, ${reorder.indicator.top}px, 0)`, width: reorder.indicator.width }} />}
      </div>

      {/* Barra de chamada conectada */}
      {connectedVoiceChannelId && (
        <div className="border-t border-black/20 bg-discord-bg-darkest px-3 py-2.5">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold" style={{ color: "var(--sekai-detail-accent, var(--sekai-logo-accent))" }}>
                <Volume2 className="h-3.5 w-3.5 shrink-0" />
                <span>Voz conectada</span>
                <span title={connectedVoicePingMs == null ? "Medindo a latência da chamada" : `Latência da chamada: ${connectedVoicePingMs} ms`} aria-label={connectedVoicePingMs == null ? "Ping da chamada sendo medido" : `Ping da chamada: ${connectedVoicePingMs} milissegundos`} className={cn("ml-auto inline-flex items-center gap-1 text-[10px] font-medium", connectedVoicePingMs == null ? "text-discord-text-muted" : connectedVoicePingMs < 100 ? "text-emerald-400" : connectedVoicePingMs < 200 ? "text-amber-300" : "text-rose-400")}>
                  <Wifi className="h-3.5 w-3.5" />{connectedVoicePingMs == null ? "— ms" : `${connectedVoicePingMs} ms`}
                </span>
              </p>
              <p className="truncate pl-5 text-[11px] text-discord-text-muted">{connectedVoiceChannelName ?? "Canal de voz"}</p>
            </div>
            <div className="flex w-full items-center justify-between gap-0.5 rounded-xl border border-white/[0.07] bg-white/[0.035] p-1">
              <div ref={voiceInputAnchorRef} className="relative flex items-center gap-0.5">
                <button type="button" onClick={onToggleMute} disabled={!onToggleMute} title={currentUser.isMuted ? "Ativar microfone" : "Silenciar microfone"} aria-label={currentUser.isMuted ? "Ativar microfone" : "Silenciar microfone"} aria-pressed={currentUser.isMuted} className={cn("grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white/10 disabled:opacity-40", currentUser.isMuted ? "text-discord-danger" : "text-discord-text-muted hover:text-white")}>
                  <MicIcon off={currentUser.isMuted} />
                </button>
                <button type="button" onClick={() => { setVoiceAudioMenuOpen((open) => open === "input" ? null : "input"); setVoiceProfileMenuOpen(false); }} aria-label="Configurações do microfone" aria-expanded={voiceAudioMenuOpen === "input"} title="Configurações do microfone" className="grid h-6 w-5 place-items-center rounded-md text-discord-text-muted transition hover:bg-white/10 hover:text-white">
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", voiceAudioMenuOpen === "input" && "rotate-180")} />
                </button>
                <AnchoredPopover open={voiceAudioMenuOpen === "input"} anchorRef={voiceInputAnchorRef} width={320} className="rounded-xl border border-surface-border bg-[#24262d] p-3 text-white shadow-2xl">
                  <h3 className="px-1 text-sm font-semibold">Dispositivo de entrada</h3>
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                    {voiceAudioSettings?.inputDevices.length ? voiceAudioSettings.inputDevices.map((device) => <VoiceAudioOption key={device.deviceId} label={device.label} selected={device.deviceId === voiceAudioSettings.selectedInputDeviceId} onClick={() => { onSelectVoiceInputDevice?.(device.deviceId); setVoiceAudioMenuOpen(null); }} />) : <p className="px-2 py-2 text-xs text-white/50">Nenhum microfone encontrado</p>}
                  </div>
                  <div className="my-3 border-t border-white/10" />
                  <button type="button" onClick={() => setVoiceProfileMenuOpen((open) => !open)} aria-expanded={voiceProfileMenuOpen} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.06]">
                    <span><span className="block text-xs font-semibold">Perfil de entrada</span><span className="mt-0.5 block text-[11px] text-white/55">{voiceProfileLabel(voiceAudioSettings?.voiceProfile ?? "standard")}</span></span><Settings className="h-4 w-4 text-white/55" />
                  </button>
                  {voiceProfileMenuOpen && <div className="mt-1 space-y-1 rounded-lg bg-black/15 p-1">
                    <VoiceAudioOption label="Padrão" selected={voiceAudioSettings?.voiceProfile === "standard"} onClick={() => { onVoiceProfileChange?.("standard"); setVoiceProfileMenuOpen(false); }} />
                    <VoiceAudioOption label="Supressão neural (RNNoise)" selected={voiceAudioSettings?.voiceProfile === "noise-suppression"} onClick={() => { onVoiceProfileChange?.("noise-suppression"); setVoiceProfileMenuOpen(false); }} />
                    <VoiceAudioOption label="Supressão ElevenLabs" selected={voiceAudioSettings?.voiceProfile === "elevenlabs"} onClick={() => { onVoiceProfileChange?.("elevenlabs"); setVoiceProfileMenuOpen(false); }} />
                  </div>}
                  <label className="mt-3 block border-t border-white/10 pt-3">
                    <span className="flex items-center justify-between text-xs font-semibold"><span>Volume de entrada</span><span className="text-white/55">{Math.round((voiceAudioSettings?.inputVolume ?? 1) * 100)}%</span></span>
                    <input aria-label="Volume de entrada do microfone" type="range" min="0" max="2" step="0.01" value={voiceAudioSettings?.inputVolume ?? 1} onChange={(event) => onVoiceInputVolumeChange?.(Number(event.target.value))} className="mt-3 w-full accent-[rgb(var(--d-brand))]" />
                  </label>
                  <button type="button" onClick={() => { setVoiceAudioMenuOpen(null); onOpenVoiceSettings?.(); }} className="mt-3 flex w-full items-center gap-2 border-t border-white/10 px-2 pt-3 text-left text-xs font-semibold text-white/80 transition hover:text-white"><Settings className="h-4 w-4" /> Configurações de voz</button>
                </AnchoredPopover>
              </div>
              <div ref={voiceOutputAnchorRef} className="relative flex items-center gap-0.5">
                <button type="button" onClick={onToggleDeafen} disabled={!onToggleDeafen} title={currentUser.isDeafened ? "Reativar áudio" : "Ensurdecer"} aria-label={currentUser.isDeafened ? "Reativar áudio" : "Ensurdecer"} aria-pressed={currentUser.isDeafened} className={cn("grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white/10 disabled:opacity-40", currentUser.isDeafened ? "text-discord-danger" : "text-discord-text-muted hover:text-white")}>
                  <Headphones className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => { setVoiceAudioMenuOpen((open) => open === "output" ? null : "output"); setVoiceProfileMenuOpen(false); }} aria-label="Configurações da saída de áudio" aria-expanded={voiceAudioMenuOpen === "output"} title="Configurações da saída de áudio" className="grid h-6 w-5 place-items-center rounded-md text-discord-text-muted transition hover:bg-white/10 hover:text-white">
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", voiceAudioMenuOpen === "output" && "rotate-180")} />
                </button>
                <AnchoredPopover open={voiceAudioMenuOpen === "output"} anchorRef={voiceOutputAnchorRef} width={320} className="rounded-xl border border-surface-border bg-[#24262d] p-3 text-white shadow-2xl">
                  <h3 className="px-1 text-sm font-semibold">Dispositivo de saída</h3>
                  {!voiceAudioSettings?.outputDeviceSelectionSupported ? <p className="mt-2 rounded-lg bg-black/15 px-2 py-2 text-xs leading-relaxed text-white/55">Este navegador não permite escolher a saída de áudio. O Sekai continuará usando a saída padrão do sistema.</p> : <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                    <VoiceAudioOption label="Padrão do sistema" selected={!voiceAudioSettings.selectedOutputDeviceId || voiceAudioSettings.selectedOutputDeviceId === "default"} onClick={() => { onSelectVoiceOutputDevice?.(""); setVoiceAudioMenuOpen(null); }} />
                    {voiceAudioSettings.outputDevices.filter((device) => device.deviceId !== "default").map((device) => <VoiceAudioOption key={device.deviceId} label={device.label} selected={device.deviceId === voiceAudioSettings.selectedOutputDeviceId} onClick={() => { onSelectVoiceOutputDevice?.(device.deviceId); setVoiceAudioMenuOpen(null); }} />)}
                  </div>}
                  <label className="mt-3 block border-t border-white/10 pt-3">
                    <span className="flex items-center justify-between text-xs font-semibold"><span>Volume de saída</span><span className="text-white/55">{Math.round((voiceAudioSettings?.outputVolume ?? 1) * 100)}%</span></span>
                    <input aria-label="Volume de saída" type="range" min="0" max="1" step="0.01" value={voiceAudioSettings?.outputVolume ?? 1} onChange={(event) => onVoiceOutputVolumeChange?.(Number(event.target.value))} className="mt-3 w-full accent-[rgb(var(--d-brand))]" />
                  </label>
                </AnchoredPopover>
              </div>
              <button type="button" onClick={onToggleCamera} disabled={!onToggleCamera} title={currentUser.isCameraOn ? "Desativar câmera" : "Ativar câmera"} aria-label={currentUser.isCameraOn ? "Desativar câmera" : "Ativar câmera"} aria-pressed={!currentUser.isCameraOn} className={cn("grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white/10 disabled:opacity-40", currentUser.isCameraOn ? "text-discord-text-muted hover:text-white" : "text-discord-danger")}>
                <CamIcon off={!currentUser.isCameraOn} />
              </button>
              {(connectedVoiceServerId || onPresentScreen) && <button type="button" onClick={onPresentScreen} disabled={!onPresentScreen} title="Transmitir tela" aria-label="Transmitir tela" className="grid h-8 w-8 place-items-center rounded-lg text-discord-text-muted transition hover:bg-white/10 hover:text-white disabled:opacity-40">
                <ScreenShareIcon active={false} />
              </button>}
              <button type="button" onClick={onDisconnectVoice} disabled={!onDisconnectVoice} title="Sair da chamada" aria-label="Sair da chamada" className="grid h-8 w-8 place-items-center rounded-lg text-discord-danger transition hover:bg-discord-danger/15 disabled:opacity-40">
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Painel do usuário */}
      <CurrentUserProfileMenu user={currentUser} onOpenSettings={onOpenSettings} onViewProfile={onViewProfile} onPresenceChange={onPresenceChange}>
      {({ toggle, openSettings, isOpen, triggerRef }) => <div ref={triggerRef} className="profile-footer group relative flex flex-col gap-1 rounded-lg border border-transparent bg-discord-bg-darkest px-2 py-2 transition-colors duration-200 hover:border-white/5 hover:bg-discord-bg-modifier-hover/70 focus-within:border-white/10">
        <div className="flex min-w-0 items-center gap-2">
        <button onClick={toggle} aria-label="Abrir menu do perfil" aria-expanded={isOpen} className={`profile-footer-avatar relative h-8 w-8 shrink-0 rounded-full bg-discord-brand ring-offset-2 ring-offset-discord-bg-darkest transition hover:ring-2 hover:ring-discord-brand ${currentUser.isSpeaking ? "voice-speaking-avatar" : ""}`}>
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
        </div>

        <div className="profile-footer-actions flex items-center justify-end gap-0.5 border-t border-white/[0.06] pt-1">
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
      <div className="flex justify-end px-3 pb-1 pt-0.5">
        <span
          aria-label={`Versão do Sekai ${packageJson.version}`}
          title={`Versão do Sekai ${packageJson.version}`}
          className="text-[10px] font-medium tracking-wide text-discord-text-muted/60"
        >
          v{packageJson.version}
        </span>
      </div>
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

function VoiceAudioOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition", selected ? "bg-brand-500/20 text-white" : "text-white/75 hover:bg-white/[0.06] hover:text-white")}>
    <span className="truncate">{label}</span>{selected && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />}
  </button>;
}


