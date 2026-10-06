"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefCallback } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Copy, Pencil, Plus, UserRound } from "lucide-react";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { CroppedProfileImage, ProfileBanner } from "@/components/ProfileBanner";
import { PresenceIndicator, type Presence } from "@/components/PresenceIndicator";
import type { CustomBadge } from "@/lib/badges";
import { getProfilePalette } from "@/lib/utils";

export interface CurrentUserProfileMenuUser {
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
  customStatus?: string | null;
  presence: Presence;
}

interface CurrentUserProfileMenuProps {
  user: CurrentUserProfileMenuUser;
  onOpenSettings?: () => void;
  onPresenceChange?: (presence: Presence) => boolean | void | Promise<boolean | void>;
  openRequest?: number;
  children: (options: { toggle: () => void; openSettings: () => void; isOpen: boolean; triggerRef: RefCallback<HTMLDivElement> }) => ReactNode;
}

const PRESENCE_OPTIONS: { id: Presence; label: string; description?: string }[] = [
  { id: "online", label: "Online" },
  { id: "idle", label: "Ausente" },
  { id: "dnd", label: "Não perturbe", description: "Você não receberá notificações" },
  { id: "offline", label: "Invisível", description: "Você aparecerá offline" },
];

const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Online",
  idle: "Ausente",
  dnd: "Não perturbe",
  offline: "Invisível",
};


export function CurrentUserProfileMenu({ user, onOpenSettings, onPresenceChange, openRequest, children }: CurrentUserProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingPresence, setPendingPresence] = useState<Presence | null>(null);
  const [presenceError, setPresenceError] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ left: number; bottom: number } | null>(null);
  const [presencePosition, setPresencePosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const presenceRowRef = useRef<HTMLButtonElement | null>(null);
  const presenceMenuRef = useRef<HTMLDivElement | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const lastOpenRequestRef = useRef(openRequest ?? 0);
  const palette = getProfilePalette(user.profileCardColor);
  const bindTriggerRef: RefCallback<HTMLDivElement> = useCallback((element) => {
    triggerRef.current = element;
  }, []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    setMenuPosition({
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      bottom: Math.max(12, window.innerHeight - bounds.top + 8),
    });
  }, []);

  const updatePresencePosition = useCallback(() => {
    const card = cardRef.current?.getBoundingClientRect();
    const row = presenceRowRef.current?.getBoundingClientRect();
    if (!card || !row) return;
    const width = Math.min(300, window.innerWidth - 24);
    const height = 256;
    const rightSide = card.right + 8;
    const leftSide = card.left - width - 8;
    const left = rightSide + width <= window.innerWidth - 12
      ? rightSide
      : leftSide >= 12 ? leftSide : Math.max(12, window.innerWidth - width - 12);
    const top = Math.max(12, Math.min(row.top - 8, window.innerHeight - height - 12));
    setPresencePosition({ left, top });
  }, []);

  const toggle = useCallback(() => {
    if (!open) updateMenuPosition();
    else {
      setPresenceOpen(false);
      setAccountsOpen(false);
    }
    setOpen((value) => !value);
  }, [open, updateMenuPosition]);

  const openSettings = useCallback(() => {
    setOpen(false);
    setPresenceOpen(false);
    setAccountsOpen(false);
    onOpenSettings?.();
  }, [onOpenSettings]);

  useEffect(() => {
    if (openRequest === undefined || openRequest === lastOpenRequestRef.current) return;
    lastOpenRequestRef.current = openRequest;
    setPresenceOpen(false);
    setAccountsOpen(false);
    updateMenuPosition();
    setOpen(true);
  }, [openRequest, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const reposition = () => {
      updateMenuPosition();
      if (presenceOpen) updatePresencePosition();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !cardRef.current?.contains(target) && !presenceMenuRef.current?.contains(target)) {
        setOpen(false);
        setPresenceOpen(false);
        setAccountsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPresenceOpen(false);
        setAccountsOpen(false);
      }
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, presenceOpen, updateMenuPosition, updatePresencePosition]);

  useEffect(() => {
    if (open && presenceOpen) updatePresencePosition();
    else setPresencePosition(null);
  }, [open, presenceOpen, updatePresencePosition]);

  useEffect(() => () => {
    if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
  }, []);

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(user.userId);
      setCopied(true);
      if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // A API de clipboard pode estar bloqueada pelo navegador.
    }
  }

  async function changePresence(presence: Presence) {
    if (pendingPresence) return;
    if (!onPresenceChange) {
      setPresenceError("Não foi possível alterar seu status agora.");
      return;
    }

    setPresenceError("");
    setPendingPresence(presence);
    try {
      const saved = await onPresenceChange(presence);
      if (saved === false) {
        setPresenceError("Não foi possível salvar o status. Tente novamente.");
        return;
      }
      setPresenceOpen(false);
    } catch {
      setPresenceError("Não foi possível salvar o status. Tente novamente.");
    } finally {
      setPendingPresence(null);
    }
  }

  return <>
    {children({ toggle, openSettings, isOpen: open, triggerRef: bindTriggerRef })}
    {open && menuPosition && typeof document !== "undefined" && createPortal(<>
      <div
        ref={cardRef}
        className="profile-card-enter fixed z-[1000] max-h-[calc(100vh-24px)] w-[min(300px,calc(100vw-24px))] overflow-y-auto overflow-x-hidden rounded-[16px] border shadow-[0_16px_48px_rgba(0,0,0,.55)]"
        style={{ left: menuPosition.left, bottom: menuPosition.bottom, backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}
      >
        <ProfileBanner src={user.bannerUrl} positionX={user.bannerPositionX} positionY={user.bannerPositionY} zoom={user.bannerZoom} className="h-24 !bg-black" />
        <div className="relative px-4 pb-4">
          <div className="-mt-10 flex min-h-[82px] items-end gap-2">
            <div className="relative h-[84px] w-[84px] shrink-0 overflow-visible rounded-full border-[5px] bg-discord-brand" style={{ borderColor: palette.surface }}>
              <span className="absolute inset-0 overflow-hidden rounded-full">{user.avatarUrl ? <CroppedProfileImage src={user.avatarUrl} alt="" className="rounded-full" positionX={user.avatarPositionX} positionY={user.avatarPositionY} zoom={user.avatarZoom} /> : <span className="grid h-full place-items-center text-2xl font-bold text-white">{user.displayName[0]?.toUpperCase()}</span>}</span>
              <PresenceIndicator presence={user.presence} avatarBadge borderColor={palette.surface} cutoutColor={palette.surface} />
            </div>
            <button type="button" onClick={openSettings} className="mb-1 flex min-w-0 flex-1 items-center gap-2 rounded-full px-2.5 py-2 text-left transition hover:brightness-110" style={{ backgroundColor: palette.inset }}>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ backgroundColor: palette.inset }}><Plus size={14} /></span>
              <span className="min-w-0 truncate text-[11px] italic" style={{ color: palette.muted }}>{user.customStatus || "Defina um status"}</span>
            </button>
          </div>

          <div className="mt-2 min-w-0">
            <p className="truncate text-[19px] font-bold leading-6">{user.displayName}</p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" style={{ color: palette.muted }}>
              <span className="truncate">{user.username || user.userId.slice(0, 8)}</span>
              <CustomBadgeList badges={user.badges} limit={5} size="small" />
            </div>
          </div>

          <button type="button" onClick={openSettings} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition hover:brightness-110" style={{ backgroundColor: palette.inset }}>
            <Pencil size={16} className="shrink-0" />
            <span>Editar perfil</span>
          </button>

          <div className="mt-3 rounded-xl p-1" style={{ backgroundColor: palette.inset }}>
            <button ref={presenceRowRef} type="button" aria-expanded={presenceOpen} onClick={() => { setPresenceError(""); setPresenceOpen((value) => !value); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-black/5">
              <PresenceIndicator presence={user.presence} size={16} cutoutColor={palette.surface} hollowSymbols />
              <span className="flex-1 text-sm">{PRESENCE_LABEL[user.presence]}</span>
              <ChevronRight size={16} className="opacity-70" />
            </button>
          </div>

          <div className="mt-3 rounded-xl p-1" style={{ backgroundColor: palette.inset }}>
            <button type="button" aria-expanded={accountsOpen} onClick={() => setAccountsOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition hover:bg-black/5">
              <UserRound size={16} className="shrink-0" />
              <span className="flex-1">Trocar contas</span>
              <ChevronRight size={16} className="opacity-70" />
            </button>
            {accountsOpen && <p className="px-3 pb-3 pl-10 text-xs leading-5" style={{ color: palette.muted }}>Nenhuma outra conta está conectada neste dispositivo.</p>}
            <div className="mx-2 border-t" style={{ borderColor: palette.isLight ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.1)" }} />
            <button type="button" onClick={() => void copyUserId()} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition hover:bg-black/5">
              {copied ? <Check size={16} className="shrink-0" /> : <Copy size={16} className="shrink-0" />}
              <span>{copied ? "ID copiado" : "Copiar ID do usuário"}</span>
            </button>
          </div>
        </div>
      </div>

      {presenceOpen && presencePosition && <div
        ref={presenceMenuRef}
        className="fixed z-[1010] w-[min(300px,calc(100vw-24px))] rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 text-discord-text-normal shadow-2xl"
        style={{ left: presencePosition.left, top: presencePosition.top }}
        role="menu"
        aria-label="Definir status"
      >
        {PRESENCE_OPTIONS.map((option) => <button key={option.id} type="button" role="menuitemradio" aria-checked={user.presence === option.id} aria-busy={pendingPresence === option.id} disabled={pendingPresence !== null} onClick={() => void changePresence(option.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-discord-bg-modifier-hover disabled:cursor-wait disabled:opacity-60">
          <PresenceIndicator presence={option.id} size={16} cutoutColor="rgb(43, 45, 49)" dndBarColor="#ffffff" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{option.label}</span>
            {option.description && <span className="mt-0.5 block text-[11px] leading-4 text-discord-text-muted">{option.description}</span>}
          </span>
          {user.presence === option.id && <Check size={14} className="shrink-0 text-discord-brand" />}
        </button>)}
        {pendingPresence && <p role="status" className="px-3 py-2 text-xs text-discord-text-muted">Salvando status…</p>}
        {presenceError && <p role="alert" className="px-3 py-2 text-xs text-red-300">{presenceError}</p>}
      </div>}
    </>, document.body)}
  </>;
}
