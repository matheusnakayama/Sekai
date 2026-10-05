"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Hash,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  Settings,
  Plus,
  PhoneOff,
  Pencil,
  UserRound,
} from "lucide-react";
import { cn, getProfilePalette } from "@/lib/utils";
import ThemePicker from "@/components/ThemePicker";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { CroppedProfileImage, ProfileBanner } from "@/components/ProfileBanner";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import type { CustomBadge } from "@/lib/badges";

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  categoryId: string | null;
  categoryName: string;
  unread?: boolean;
}

export interface VoiceMemberPreview {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isSpeaking?: boolean;
}

interface ChannelSidebarProps {
  serverName: string;
  channels: Channel[];
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
  onOpenSettings?: () => void;
  onPresenceChange?: (presence: "online" | "idle" | "dnd" | "offline") => void;
  canManageChannels?: boolean;
  onCreateChannel?: (categoryId: string | null) => void;
  onCreateCategory?: () => void;
  onDeleteChannel?: (channel: Channel) => void;
  /** Canal de voz em que você está conectado agora (a chamada segue ativa em segundo plano). */
  connectedVoiceChannelId?: string | null;
  connectedVoiceChannelName?: string;
  connectedVoiceMembers?: VoiceMemberPreview[];
  voiceMembersByChannel?: Record<string, VoiceMemberPreview[]>;
  onDisconnectVoice?: () => void;
}

export function ChannelSidebar({
  serverName,
  channels,
  activeChannelId,
  onSelectChannel,
  onOpenServerMenu,
  currentUser,
  onToggleMute,
  onToggleDeafen,
  onOpenSettings,
  onPresenceChange,
  canManageChannels = false,
  onCreateChannel,
  onCreateCategory,
  onDeleteChannel,
  connectedVoiceChannelId,
  connectedVoiceChannelName,
  connectedVoiceMembers = [],
  voiceMembersByChannel = {},
  onDisconnectVoice,
}: ChannelSidebarProps) {
  const categories = Array.from(new Set(channels.map((c) => c.categoryName)));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [userIdCopied, setUserIdCopied] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    function closeOnOutside(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
        setPresenceMenuOpen(false);
        setAccountMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setProfileMenuOpen(false); setPresenceMenuOpen(false); setAccountMenuOpen(false); }
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [profileMenuOpen]);

  const presenceOptions = [
    { id: "online" as const, label: "Online" },
    { id: "idle" as const, label: "Ausente" },
    { id: "dnd" as const, label: "Não perturbe" },
    { id: "offline" as const, label: "Invisível" },
  ];
  const presenceLabel = presenceOptions.find((item) => item.id === currentUser.presence)?.label ?? "Online";
  const profilePalette = getProfilePalette(currentUser.profileCardColor);

  return (
    <div className="server-view-enter flex h-full w-60 flex-col bg-discord-bg-dark">
      {/* Cabeçalho do servidor */}
      <button
        onClick={onOpenServerMenu}
        className="bg-theme-wash flex h-12 items-center justify-between border-b border-black/20 px-4 shadow-sm hover:brightness-125"
      >
        <span className="truncate font-semibold text-discord-header-primary">{serverName}</span>
        <ChevronDown className="h-4 w-4 text-discord-text-muted" />
      </button>

      {/* Lista de canais */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-2 py-3">
        {categories.map((category) => {
          const isCollapsed = collapsed[category];
          const categoryChannels = channels.filter((c) => c.categoryName === category);
          const categoryId = categoryChannels[0]?.categoryId ?? null;

          return (
            <div key={category} className="border-b border-white/[0.07] pb-2.5 last:border-b-0">
              <div className="group flex items-center justify-between rounded-md bg-black/[0.08] px-1 py-1">
                <button
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))
                  }
                  className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-discord-text-muted hover:text-discord-header-primary"
                >
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")}
                  />
                  {category}
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
                    return (
                      <div key={channel.id} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, channel }); }}>
                        <button
                          onClick={() => onSelectChannel(channel.id)}
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium",
                            active
                              ? "bg-discord-bg-modifier-hover text-discord-header-primary"
                              : "text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-text-normal"
                          )}
                        >
                          {channel.type === "text" ? (
                            <Hash className="h-4 w-4 shrink-0" />
                          ) : (
                            <Volume2 className="h-4 w-4 shrink-0" />
                          )}
                          <span className="truncate">{channel.name}</span>
                          {(voiceMembersByChannel[channel.id]?.length ?? 0) > 0 && (
                            <span
                              className="ml-auto h-2 w-2 rounded-full bg-discord-online"
                              title="Conectado"
                            />
                          )}
                          {channel.unread && (
                            <span className="ml-auto h-2 w-2 rounded-full bg-white" />
                          )}
                        </button>
                        {channel.type === "voice" && (voiceMembersByChannel[channel.id] ?? (channel.id === connectedVoiceChannelId ? connectedVoiceMembers : [])).length > 0 && (
                          <div className="ml-8 mt-0.5 space-y-1 border-l border-white/10 py-1 pl-2">
                            {(voiceMembersByChannel[channel.id] ?? (channel.id === connectedVoiceChannelId ? connectedVoiceMembers : [])).map((member) => (
                              <div key={member.id} className="flex min-w-0 items-center gap-2">
                                <div className={`h-5 w-5 shrink-0 overflow-hidden rounded-full bg-discord-brand text-center text-[10px] leading-5 text-white ${member.isSpeaking ? "voice-speaking-avatar" : ""}`}>
                                  {member.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
                                  ) : member.name[0]?.toUpperCase()}
                                </div>
                                <span className="truncate text-[11px] text-discord-text-normal">{member.name}</span>
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
            className="flex w-full items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-discord-text-muted hover:text-discord-header-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Criar categoria
          </button>
        )}
      </div>

      {contextMenu && <><button aria-label="Fechar opções do canal" className="fixed inset-0 z-40 cursor-default" onClick={() => setContextMenu(null)} /><div style={{ left: Math.min(contextMenu.x, window.innerWidth - 205), top: Math.min(contextMenu.y, window.innerHeight - 95) }} className="fixed z-50 w-48 rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 shadow-2xl"><p className="px-3 py-2 text-xs font-semibold text-discord-text-muted">#{contextMenu.channel.name}</p>{canManageChannels && <button onClick={() => { onDeleteChannel?.(contextMenu.channel); setContextMenu(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Excluir canal</button>}</div></>}

      {/* Barra de chamada conectada (como no Discord) */}
      {connectedVoiceChannelId && (
        <div className="border-t border-black/20 bg-discord-bg-darkest px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-discord-online"><Volume2 className="h-3.5 w-3.5"/>Voz conectada</p>
              <p className="truncate pl-5 text-[11px] text-discord-text-muted">{connectedVoiceChannelName ?? "Canal de voz"}</p>
            </div>
            {onToggleMute && <button onClick={onToggleMute} title={currentUser.isMuted ? "Ativar microfone" : "Mutar microfone"} aria-label={currentUser.isMuted ? "Ativar microfone" : "Mutar microfone"} aria-pressed={currentUser.isMuted} className={cn("rounded-md p-1.5 transition hover:bg-discord-bg-modifier-hover", currentUser.isMuted ? "text-discord-danger" : "text-discord-text-muted hover:text-white")}>{currentUser.isMuted ? <MicOff className="h-4 w-4"/> : <Mic className="h-4 w-4"/>}</button>}
            {onToggleDeafen && <button onClick={onToggleDeafen} title={currentUser.isDeafened ? "Reativar áudio" : "Ensurdecer"} aria-label={currentUser.isDeafened ? "Reativar áudio" : "Ensurdecer"} aria-pressed={currentUser.isDeafened} className={cn("rounded-md p-1.5 transition hover:bg-discord-bg-modifier-hover", currentUser.isDeafened ? "text-discord-danger" : "text-discord-text-muted hover:text-white")}><Headphones className="h-4 w-4"/></button>}
            <button
              onClick={onDisconnectVoice}
              title="Desconectar da chamada"
              aria-label="Desconectar da chamada"
              className="rounded-md p-1.5 text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-danger"
            >
              <PhoneOff className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      )}

      {/* Painel do usuário */}
      <div ref={profileMenuRef} className="profile-footer group relative flex h-[52px] items-center gap-2 rounded-lg border border-transparent bg-discord-bg-darkest px-2 transition-colors duration-200 hover:border-white/5 hover:bg-discord-bg-modifier-hover/70 focus-within:border-white/10">
        {profileMenuOpen && (
          <div
            className="profile-card-enter absolute bottom-[calc(100%+10px)] left-2 z-[150] w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-[16px] border shadow-[0_16px_48px_rgba(0,0,0,.55)]"
            style={{ backgroundColor: profilePalette.surface, borderColor: profilePalette.border, color: profilePalette.text }}
          >
            <ProfileBanner src={currentUser.bannerUrl} positionX={currentUser.bannerPositionX} positionY={currentUser.bannerPositionY} zoom={currentUser.bannerZoom} className="h-24 !bg-black" />
            <div className="relative px-4 pb-4">
              <div className="-mt-10 flex min-h-[82px] items-end gap-2">
                <div className="relative h-[84px] w-[84px] shrink-0 overflow-visible rounded-full border-[5px] bg-discord-brand" style={{ borderColor: profilePalette.surface }}>
                  <span className="absolute inset-0 overflow-hidden rounded-full">{currentUser.avatarUrl ? <CroppedProfileImage src={currentUser.avatarUrl} alt="" className="rounded-full" positionX={currentUser.avatarPositionX} positionY={currentUser.avatarPositionY} zoom={currentUser.avatarZoom}/> : <span className="grid h-full place-items-center text-2xl font-bold text-white">{currentUser.displayName[0]?.toUpperCase()}</span>}</span>
                  <PresenceIndicator presence={currentUser.presence} size={18} borderColor={profilePalette.surface} cutoutColor={profilePalette.surface} className="absolute -bottom-0.5 -right-0.5 border-[3px]" />
                </div>
                <button type="button" onClick={() => { setProfileMenuOpen(false); onOpenSettings?.(); }} className="mb-1 flex min-w-0 flex-1 items-center gap-2 rounded-full px-2.5 py-2 text-left transition hover:brightness-110" style={{ backgroundColor: profilePalette.inset }}>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ backgroundColor: profilePalette.inset }}><Plus size={14}/></span>
                  <span className="min-w-0 truncate text-[11px] italic" style={{ color: profilePalette.muted }}>{currentUser.customStatus || "Defina um status"}</span>
                </button>
              </div>

              <div className="mt-2 min-w-0">
                <p className="truncate text-[19px] font-bold leading-6">{currentUser.displayName}</p>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" style={{ color: profilePalette.muted }}>
                  <span className="truncate">{currentUser.username || currentUser.userId.slice(0, 8)}</span>
                  <CustomBadgeList badges={currentUser.badges} limit={5} size="small" />
                </div>
              </div>

              <button type="button" onClick={() => { setProfileMenuOpen(false); onOpenSettings?.(); }} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition hover:brightness-110" style={{ backgroundColor: profilePalette.inset }}>
                <Pencil size={16} className="shrink-0" />
                <span>Editar perfil</span>
              </button>

              <div className="relative mt-3 rounded-xl p-1" style={{ backgroundColor: profilePalette.inset }}>
                <button type="button" aria-expanded={presenceMenuOpen} onClick={() => setPresenceMenuOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-black/5">
                  <PresenceIndicator presence={currentUser.presence} size={16} cutoutColor={profilePalette.surface} />
                  <span className="flex-1 text-sm">{presenceLabel}</span>
                  <ChevronRight size={16} className="opacity-70" />
                </button>
                {presenceMenuOpen && <div className="absolute bottom-[calc(100%+8px)] left-0 z-[160] w-full rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 text-discord-text-normal shadow-2xl">{presenceOptions.map((option) => <button key={option.id} type="button" onClick={() => { onPresenceChange?.(option.id); setPresenceMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-discord-bg-modifier-hover"><PresenceIndicator presence={option.id} size={16} />{option.label}{currentUser.presence === option.id && <Check size={14} className="ml-auto text-discord-brand"/>}</button>)}</div>}
              </div>

              <div className="mt-3 rounded-xl p-1" style={{ backgroundColor: profilePalette.inset }}>
                <button type="button" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition hover:bg-black/5">
                  <UserRound size={16} className="shrink-0" />
                  <span className="flex-1">Trocar contas</span>
                  <ChevronRight size={16} className="opacity-70" />
                </button>
                {accountMenuOpen && <p className="px-3 pb-3 pl-10 text-xs leading-5" style={{ color: profilePalette.muted }}>Nenhuma outra conta está conectada neste dispositivo.</p>}
                <div className="mx-2 border-t" style={{ borderColor: profilePalette.isLight ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.1)" }} />
                <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(currentUser.userId); setUserIdCopied(true); window.setTimeout(() => setUserIdCopied(false), 1500); } catch { /* A API de clipboard pode estar bloqueada pelo navegador. */ } }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition hover:bg-black/5">
                  {userIdCopied ? <Check size={16} className="shrink-0"/> : <Copy size={16} className="shrink-0"/>}
                  <span>{userIdCopied ? "ID copiado" : "Copiar ID do usuário"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
        <button onClick={() => { setProfileMenuOpen((value) => !value); setPresenceMenuOpen(false); }} aria-label="Abrir menu do perfil" aria-expanded={profileMenuOpen} className={`relative h-8 w-8 shrink-0 rounded-full bg-discord-brand ring-offset-2 ring-offset-discord-bg-darkest transition hover:ring-2 hover:ring-discord-brand ${currentUser.isSpeaking ? "voice-speaking-avatar" : ""}`}>
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
          <PresenceIndicator presence={currentUser.presence} size={13} borderColor="rgb(var(--d-darkest))" className="absolute bottom-0 right-0 border-2" />
        </button>

        <button onClick={() => setProfileMenuOpen((value) => !value)} aria-expanded={profileMenuOpen} className="profile-footer-name min-w-0 flex-1 rounded-md py-1 text-left">
          <p className="truncate text-sm font-semibold text-discord-header-primary">{currentUser.displayName}</p>
          <p className="profile-footer-subline relative h-4 truncate text-xs text-discord-text-muted">
            <span className="profile-footer-status absolute inset-0 truncate">{currentUser.customStatus || presenceLabel}</span>
            <span className="profile-footer-username absolute inset-0 truncate">{currentUser.username || currentUser.userId.slice(0, 8)}</span>
          </p>
        </button>

        <div className="profile-footer-actions flex items-center gap-0.5">
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              title={currentUser.isMuted ? "Ativar microfone" : "Mutar microfone"}
              aria-label={currentUser.isMuted ? "Ativar microfone" : "Mutar microfone"}
              className="rounded-md p-1.5 text-discord-text-muted transition-colors hover:bg-discord-bg-modifier-hover hover:text-discord-text-normal"
            >
              {currentUser.isMuted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
            </button>
          )}

          {onToggleDeafen && (
            <button
              onClick={onToggleDeafen}
              title={currentUser.isDeafened ? "Ativar áudio" : "Desativar áudio"}
              aria-label={currentUser.isDeafened ? "Ativar áudio" : "Desativar áudio"}
              className={cn(
                "rounded-md p-1.5 transition-colors hover:bg-discord-bg-modifier-hover",
                currentUser.isDeafened ? "text-discord-danger" : "text-discord-text-muted hover:text-discord-text-normal"
              )}
            >
              <Headphones className="h-[18px] w-[18px]" />
            </button>
          )}

          <ThemePicker placement="up" align="left" />

          <button
            onClick={onOpenSettings}
            title="Configurações"
            aria-label="Abrir configurações"
            className="rounded-md p-1.5 text-discord-text-muted transition-colors hover:bg-discord-bg-modifier-hover hover:text-discord-text-normal"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

