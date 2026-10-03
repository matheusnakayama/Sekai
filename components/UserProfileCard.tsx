"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, MessageCircle, Shield, UserPlus, UserMinus, X } from "lucide-react";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { HoverGifImage } from "@/components/HoverGifImage";
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
  status: "online" | "idle" | "dnd" | "offline";
  roleName: string;
  roleColor?: string;
}

export interface ProfileCardPosition {
  left: number;
  top: number;
}

interface ProfileRoleOption {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

export function getProfileCardPosition(anchor: HTMLElement, preferRight = false): ProfileCardPosition {
  const bounds = anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24);
  const height = Math.min(560, window.innerHeight - 24);
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
      style={{ left: position.left, top: position.top, backgroundColor: profile.profileCardColor || undefined }}
      className={`profile-card-enter fixed z-[150] max-h-[calc(100dvh-24px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 shadow-2xl ${profile.profileCardColor ? "" : "bg-discord-bg-secondary"}`}
    >
      <div
        className="relative h-28 bg-theme-gradient bg-cover bg-center"
        style={profile.bannerUrl ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.1),rgba(0,0,0,.1)),url("${profile.bannerUrl}")` } : undefined}
      >
        <button onClick={onClose} aria-label="Fechar perfil" className="absolute right-3 top-3 rounded-full bg-black/35 p-2 text-white/80 transition hover:bg-black/60"><X size={18}/></button>
      </div>
      <div className="relative -mt-10 px-5">
        <div className="relative h-20 w-20">
          <div className="h-full w-full overflow-hidden rounded-full border-4 border-discord-bg-secondary bg-discord-brand shadow-lg">
            {profile.avatarUrl ? (
              <HoverGifImage src={profile.avatarUrl} alt="" className="h-full w-full object-cover"/>
            ) : (
              <span className="grid h-full place-items-center text-2xl font-bold text-white">{profile.displayName[0]?.toUpperCase()}</span>
            )}
          </div>
          <span className={cn("status-dot", STATUS_CLASS[profile.status])}/>
        </div>
        <div className="mt-3 p-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="max-w-full truncate text-lg font-bold text-discord-header-primary">{profile.displayName}</h2>
            <CustomBadgeList badges={profile.badges} limit={5} size="medium"/>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-discord-text-muted">
            <span>@{profile.username || profile.id.slice(0, 8)}</span>
            {profile.pronouns && <><span>·</span><span>{profile.pronouns}</span></>}
          </div>
          <p className="mt-2 text-xs font-medium text-discord-text-muted" style={profile.roleColor ? { color: profile.roleColor } : undefined}>{profile.roleName}</p>
          {canManageRoles && roles.length > 0 && <section className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-black/15">
            <button type="button" aria-expanded={rolePanelOpen} onClick={() => setRolePanelOpen((open) => !open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-discord-text-normal transition hover:bg-white/[0.04]"><Shield size={15} className="text-discord-brand"/><span className="flex-1">Cargos do servidor</span><span className="text-discord-text-muted">{assignedRoleIds.length}</span><ChevronDown size={14} className={`transition-transform ${rolePanelOpen ? "rotate-180" : ""}`}/></button>
            {rolePanelOpen && <div className="max-h-44 space-y-1 overflow-y-auto border-t border-white/[0.07] p-2">{roles.map((role) => {
              const assigned = assignedRoleIds.includes(role.id);
              return <button key={role.id} type="button" aria-pressed={assigned} onClick={() => onToggleRole?.(role, assigned)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-discord-text-normal transition hover:bg-white/[0.06]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color || "#99aab5" }}/><span className="min-w-0 flex-1 truncate">{role.name}</span>{assigned && <Check size={14} className="text-emerald-400"/>}
              </button>;
            })}</div>}
          </section>}
          {profile.customStatus && <p className="mt-3 rounded-lg bg-black/15 px-3 py-2 text-sm text-discord-text-normal">{profile.customStatus}</p>}
          {profile.bio && <div className="mt-3 border-t border-white/10 pt-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-discord-text-muted">Sobre mim</p><p className="whitespace-pre-wrap break-words text-sm leading-5 text-discord-text-normal">{profile.bio}</p></div>}
          {profile.id !== currentUserId && (onMessage || onAddFriend || onKick) && <div className="mt-4 grid gap-2">
            {onMessage && <button onClick={() => { onMessage(); onClose(); }} className="flex items-center gap-2 rounded-lg bg-discord-brand px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"><MessageCircle size={16}/>Enviar mensagem direta</button>}
            {onAddFriend && <button onClick={() => { onAddFriend(); onClose(); }} className="flex items-center gap-2 rounded-lg bg-black/15 px-3 py-2.5 text-sm text-discord-text-normal transition hover:bg-white/10"><UserPlus size={16}/>Adicionar amigo</button>}
            {onKick && <button onClick={() => { onKick(); onClose(); }} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"><UserMinus size={16}/>Expulsar do servidor</button>}
          </div>}
        </div>
      </div>
      <div className="h-5"/>
    </section>,
    document.body,
  );
}
