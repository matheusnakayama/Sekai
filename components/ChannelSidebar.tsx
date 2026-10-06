"use client";

import { useState } from "react";
import {
  ChevronDown,
  Hash,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  Settings,
  Plus,
  PhoneOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ThemePicker from "@/components/ThemePicker";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { CurrentUserProfileMenu } from "@/components/CurrentUserProfileMenu";
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
  onPresenceChange?: (presence: "online" | "idle" | "dnd" | "offline") => boolean | void | Promise<boolean | void>;
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
  const presenceLabel = currentUser.presence === "online" ? "Online" : currentUser.presence === "idle" ? "Ausente" : currentUser.presence === "dnd" ? "Não perturbe" : "Invisível";

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

