"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AtSign,
  Ban,
  Check,
  ChevronRight,
  Clock3,
  MessageCircle,
  Shield,
  UserMinus,
  UserPlus,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import { RoleIcon } from "@/components/RoleBadgeList";
import type { MemberItem, ServerRoleOption } from "@/components/MemberList";

interface MemberContextMenuProps {
  member: MemberItem;
  currentUserId: string;
  x: number;
  y: number;
  roles: ServerRoleOption[];
  canManageRoles: boolean;
  canManageSelfRoles?: boolean;
  canManageNicknames: boolean;
  canTimeout: boolean;
  canKick: boolean;
  canBan: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onMention: () => void;
  onMessage?: () => void;
  onAddFriend: () => void;
  onChangeNickname?: () => void;
  onTimeout?: () => void;
  onKick?: () => void;
  onBan?: () => void;
  onToggleRole?: (role: ServerRoleOption, assigned: boolean) => void;
  soundEffectsMuted?: boolean;
  onToggleSoundEffects?: () => void;
}

export function MemberContextMenu({
  member,
  currentUserId,
  x,
  y,
  roles,
  canManageRoles,
  canManageSelfRoles = false,
  canManageNicknames,
  canTimeout,
  canKick,
  canBan,
  onClose,
  onOpenProfile,
  onMention,
  onMessage,
  onAddFriend,
  onChangeNickname,
  onTimeout,
  onKick,
  onBan,
  onToggleRole,
  soundEffectsMuted = false,
  onToggleSoundEffects,
}: MemberContextMenuProps) {
  const [rolesOpen, setRolesOpen] = useState(false);
  const isSelf = member.id === currentUserId;
  const canChangeRoles = canManageRoles && (!isSelf || canManageSelfRoles);
  const menuWidth = 240;
  const menuHeight = Math.min(540, window.innerHeight - 16);
  const left = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));
  const memberLabel = `@${member.username || member.displayName}`;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function run(action?: () => void) {
    return () => {
      if (!action) return;
      action();
      onClose();
    };
  }

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu do membro"
        className="fixed inset-0 z-[180] cursor-default"
        onMouseDown={onClose}
      />
      <div
        role="menu"
        aria-label={`Ações para ${member.displayName}`}
        style={{ left, top, width: menuWidth, maxHeight: menuHeight }}
        className="fixed z-[190] overflow-y-auto rounded-md border border-white/[0.08] bg-[#18191c] p-1.5 text-[#dbdee1] shadow-[0_12px_32px_rgba(0,0,0,.55)]"
      >
        <MenuAction icon={<UserRound size={15} />} label="Perfil" onClick={run(onOpenProfile)} />
        <MenuAction icon={<AtSign size={15} />} label="Menção" onClick={run(onMention)} />
        <MenuAction icon={<MessageCircle size={15} />} label="Mensagem" disabled={!onMessage || isSelf} hint={isSelf ? "Não é possível enviar mensagem para si mesmo" : undefined} onClick={run(onMessage)} />
        <MenuAction icon={<UserPlus size={15} />} label="Adicionar amigo" disabled={isSelf} hint={isSelf ? "Esta é sua própria conta" : undefined} onClick={run(onAddFriend)} />
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={soundEffectsMuted}
          disabled={isSelf || !onToggleSoundEffects}
          onClick={run(onToggleSoundEffects)}
          title={isSelf ? "Use as configurações de som do seu próprio dispositivo" : undefined}
          className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[13px] font-medium transition hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35"
        >
          {soundEffectsMuted ? <Volume2 size={15} className="shrink-0 text-white/65" /> : <VolumeX size={15} className="shrink-0 text-white/65" />}
          <span className="min-w-0 flex-1 truncate">{soundEffectsMuted ? "Ativar efeitos sonoros" : "Desativar efeitos sonoros"}</span>
          {soundEffectsMuted && <Check size={13} className="shrink-0 text-emerald-400" />}
        </button>

        <MenuDivider />

        <MenuAction
          icon={<UserRound size={15} />}
          label="Alterar apelido"
          disabled={!canManageNicknames || isSelf}
          hint={isSelf ? "Use as configurações do seu perfil para mudar seu apelido" : !canManageNicknames ? "Requer a permissão Gerenciar apelidos" : undefined}
          onClick={run(onChangeNickname)}
        />

        <button
          type="button"
          role="menuitem"
          aria-expanded={rolesOpen}
          onClick={() => setRolesOpen((open) => !open)}
          className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[13px] font-medium transition hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none"
        >
          <Shield size={15} className="shrink-0 text-white/65" />
          <span className="min-w-0 flex-1 truncate">Cargos</span>
          <ChevronRight size={14} className={`shrink-0 text-white/45 transition-transform ${rolesOpen ? "rotate-90" : ""}`} />
        </button>
        {rolesOpen && (
          <div className="mb-1 ml-2 max-h-44 overflow-y-auto border-l border-white/[0.09] pl-1">
            {roles.length ? roles.map((role) => {
              const assigned = member.roleIds?.includes(role.id) ?? false;
              const disabled = !canChangeRoles || !onToggleRole;
              return (
                <button
                  key={role.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={assigned}
                  disabled={disabled}
                  title={!canChangeRoles ? (isSelf ? "Somente o dono do servidor ou um CEO pode alterar os próprios cargos" : "Requer a permissão Gerenciar cargos") : undefined}
                  onClick={run(onToggleRole ? () => onToggleRole(role, assigned) : undefined)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <RoleIcon role={role} size="small" />
                  <span className="min-w-0 flex-1 truncate">{role.name}</span>
                  {assigned && <Check size={13} className="shrink-0 text-emerald-400" />}
                </button>
              );
            }) : <p className="px-2 py-2 text-xs text-white/40">Nenhum cargo personalizado</p>}
            {!canChangeRoles && <p className="px-2 pb-2 text-[10px] text-white/35">{isSelf ? "Somente o dono do servidor ou um CEO pode alterar os próprios cargos." : "Você não tem permissão para alterar cargos."}</p>}
          </div>
        )}

        <MenuDivider />

        <MenuAction
          icon={<Clock3 size={15} />}
          label={`Timeout ${memberLabel}`}
          danger
          disabled={!canTimeout || isSelf}
          hint={isSelf ? "Não é possível aplicar timeout em si mesmo" : !canTimeout ? "Requer Timeout ou Silenciar membros" : undefined}
          onClick={run(onTimeout)}
        />
        <MenuAction
          icon={<UserMinus size={15} />}
          label={`Expulsar ${memberLabel}`}
          danger
          disabled={!canKick || isSelf}
          hint={isSelf ? "Não é possível expulsar a própria conta" : !canKick ? "Requer a permissão Expulsar membros" : undefined}
          onClick={run(onKick)}
        />
        <MenuAction
          icon={<Ban size={15} />}
          label={`Banir ${memberLabel}`}
          danger
          disabled={!canBan || isSelf}
          hint={isSelf ? "Não é possível banir a própria conta" : !canBan ? "Requer a permissão Banir membros" : undefined}
          onClick={run(onBan)}
        />
      </div>
    </>
  );
}

function MenuAction({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false,
  hint,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={hint}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[13px] font-medium transition focus-visible:outline-none ${
        disabled
          ? "cursor-not-allowed text-white/30"
          : danger
            ? "text-[#f23f43] hover:bg-[#da373c] hover:text-white focus-visible:bg-[#da373c] focus-visible:text-white"
            : "text-[#dbdee1] hover:bg-[#5865f2] hover:text-white focus-visible:bg-[#5865f2] focus-visible:text-white"
      }`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div role="separator" className="my-1 border-t border-white/[0.08]" />;
}
