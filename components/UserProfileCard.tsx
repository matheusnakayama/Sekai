"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Check, ChevronDown, MoreHorizontal, MessageCircle, Shield, UserPlus, UserMinus } from "lucide-react";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { HoverGifImage } from "@/components/HoverGifImage";
import { RoleBadgeList, RoleIcon } from "@/components/RoleBadgeList";
import type { RoleBadge } from "@/components/RoleBadgeList";
import type { CustomBadge } from "@/lib/badges";
import { cn } from "@/lib/utils";

export interface ProfileCardUser {
  id: string;
  displayName: string;
  username?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  customStatus?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  profileCardColor?: string | null;
  badges?: CustomBadge[];
  assignedRoles?: RoleBadge[];
  status: "online" | "idle" | "dnd" | "offline";
  roleName: string;
  roleColor?: string;
}

export interface ProfileCardPosition {
  left: number;
  top: number;
}

interface ProfileRoleOption extends RoleBadge {
  position: number;
}

export function getProfileCardPosition(anchor: HTMLElement, preferRight = false): ProfileCardPosition {
  const bounds = anchor.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 24);
  const height = Math.min(620, window.innerHeight - 24);
  const roomRight = window.innerWidth - bounds.right - 12;
  const roomLeft = bounds.left - 12;
  const placeRight = preferRight && roomRight >= width;
  const left = placeRight
    ? bounds.right + 12
    : roomLeft >= width
      ? bounds.left - width - 12
      : Math.max(12, Math.min(bounds.right + 12, window.innerWidth - width - 12));

  return {
    left: Math.max(12, Math.min(left, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(bounds.top - 24, window.innerHeight - height - 12)),
  };
}

const STATUS_CLASS: Record<ProfileCardUser["status"], string> = {
  online: "status-online",
  idle: "status-idle",
  dnd: "status-dnd",
  offline: "status-offline",
};

export function UserProfileCard({
  profile,
  position,
  currentUserId,
  onClose,
  onMessage,
  onAddFriend,
  onKick,
  roles = [],
  assignedRoleIds = [],
  canManageRoles = false,
  onToggleRole,
}: {
  profile: ProfileCardUser;
  position: ProfileCardPosition;
  currentUserId: string;
  onClose: () => void;
  onMessage?: () => void;
  onAddFriend?: () => void;
  onKick?: () => void;
  roles?: ProfileRoleOption[];
  assignedRoleIds?: string[];
  canManageRoles?: boolean;
  onToggleRole?: (role: ProfileRoleOption, assigned: boolean) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [rolePanelOpen, setRolePanelOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const isOtherUser = profile.id !== currentUserId;
  const username = profile.username || profile.id.slice(0, 8);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <section
      ref={cardRef}
      role="dialog"
      aria-label={`Perfil de ${profile.displayName}`}
      style={{ left: position.left, top: position.top }}
      className="profile-card-enter fixed z-[150] max-h-[calc(100dvh-24px)] w-[min(300px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[22px] border border-white/[0.11] bg-[#0b0b0d] text-white shadow-[0_24px_80px_rgba(0,0,0,.62)]"
    >
      <header
        className="relative h-[66px] bg-theme-gradient bg-cover bg-center"
        style={profile.bannerUrl ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.16),rgba(0,0,0,.16)),url("${profile.bannerUrl}")` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/10 to-black/30" />
        <div className="absolute right-3 top-3 flex items-center gap-2">
          {isOtherUser && onAddFriend && (
            <button
              type="button"
              onClick={() => { onAddFriend(); onClose(); }}
              aria-label="Adicionar amigo"
              title="Adicionar amigo"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/45 text-white/90 shadow-lg backdrop-blur transition hover:bg-black/70 hover:text-white"
            >
              <UserPlus size={16} />
            </button>
          )}
          <button
            type="button"
            aria-label="Mais opções do perfil"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/45 text-white/90 shadow-lg backdrop-blur transition hover:bg-black/70 hover:text-white"
          >
            <MoreHorizontal size={19} />
          </button>
          {actionsOpen && (
            <div className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#18181b] p-1.5 shadow-2xl">
              {onKick && (
                <button type="button" onClick={() => { onKick(); onClose(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-red-300 transition hover:bg-red-500/10">
                  <UserMinus size={15} /> Expulsar do servidor
                </button>
              )}
              <button type="button" onClick={onClose} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-discord-text-muted transition hover:bg-white/[0.06] hover:text-white">
                Fechar perfil
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="px-4 pb-4">
        <div className="relative mt-11 h-[78px] w-[78px]">
          <div className="h-full w-full overflow-hidden rounded-full border-[4px] border-[#0b0b0d] bg-discord-brand shadow-[0_8px_24px_rgba(0,0,0,.5)]">
            {profile.avatarUrl ? (
              <HoverGifImage src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-2xl font-bold text-white">{profile.displayName[0]?.toUpperCase()}</span>
            )}
          </div>
          <span className={cn("status-dot !bottom-0.5 !right-0.5 !h-4 !w-4 !border-[3px] !border-[#0b0b0d]", STATUS_CLASS[profile.status])} />
        </div>

        <div className="mt-1.5">
          <h2 className="truncate font-sans text-[21px] font-semibold leading-7 tracking-tight text-white">{profile.displayName}</h2>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-white/70">
            <span className="truncate">@{username}</span>
            {profile.pronouns && <><span aria-hidden="true">·</span><span>{profile.pronouns}</span></>}
            <CustomBadgeList badges={profile.badges} limit={5} size="medium" />
          </div>

          {profile.customStatus && (
            <div className="mt-3 flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-[#1a1a1d] px-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-white/70"><Activity size={16} /></span>
              <span className="min-w-0 truncate text-xs font-semibold text-white/90">{profile.customStatus}</span>
            </div>
          )}

          {profile.assignedRoles?.length ? (
            <div className="mt-3" aria-label="Cargos deste membro">
              <RoleBadgeList roles={profile.assignedRoles} limit={3} size="medium" />
            </div>
          ) : null}

          {profile.bio && (
            <div className="mt-3 border-t border-white/[0.08] pt-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Sobre mim</p>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-white/80">{profile.bio}</p>
            </div>
          )}

          {canManageRoles && roles.length > 0 && (
            <section className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
              <button type="button" aria-expanded={rolePanelOpen} onClick={() => setRolePanelOpen((open) => !open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] font-semibold text-white/75 transition hover:bg-white/[0.04]">
                <Shield size={14} className="text-discord-brand" />
                <span className="flex-1">Gerenciar cargos</span>
                <span className="text-white/40">{assignedRoleIds.length}</span>
                <ChevronDown size={14} className={`transition-transform ${rolePanelOpen ? "rotate-180" : ""}`} />
              </button>
              {rolePanelOpen && (
                <div className="max-h-44 space-y-1 overflow-y-auto border-t border-white/[0.07] p-2">
                  {roles.map((role) => {
                    const assigned = assignedRoleIds.includes(role.id);
                    return (
                      <button key={role.id} type="button" aria-pressed={assigned} onClick={() => onToggleRole?.(role, assigned)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-white/80 transition hover:bg-white/[0.06]">
                        <RoleIcon role={role} />
                        <span className="min-w-0 flex-1 truncate">{role.name}</span>
                        {assigned && <Check size={14} className="text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {isOtherUser && onMessage && (
            <button type="button" onClick={() => { onMessage(); onClose(); }} className="mt-4 flex w-full items-center gap-2.5 rounded-xl bg-[#252528] px-3.5 py-3 text-left text-[13px] font-semibold text-white/90 transition hover:bg-[#303034]">
              <MessageCircle size={17} className="text-white/65" />
              <span className="min-w-0 flex-1 truncate">Enviar mensagem para @{username}</span>
            </button>
          )}
        </div>
      </div>
    </section>,
    document.body,
  );
}
