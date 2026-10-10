"use client";

import { Figtree } from "next/font/google";
import { cn } from "@/lib/utils";
import type { RoleBadge } from "@/components/RoleBadgeList";
import { RoleInsignia } from "@/components/RoleBadgeList";
import { MemberContextMenu } from "@/components/MemberContextMenu";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { ListeningLine, useListeningByUser } from "@/components/NowPlayingCard";
import { getProfileCardPosition, UserProfileCard } from "@/components/UserProfileCard";
import type { MutualServer, ProfileCardPosition } from "@/components/UserProfileCard";
import type { CustomBadge } from "@/lib/badges";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { UserPlus } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";

const memberFont = Figtree({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export interface MemberItem {
  id: string;
  displayName: string;
  username?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  customStatus?: string | null;
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
  status: "online" | "idle" | "dnd" | "offline";
  /** Estado salvo no perfil, separado do estado de conexão ao vivo. */
  profilePresence?: "online" | "idle" | "dnd" | "offline";
  roleId?: string;
  roleName: string;
  roleColor?: string; // hex, ex: "#f23f43" para Admin
  roleIconUrl?: string | null;
  roleInsigniaUrl?: string | null;
  rolePosition?: number;
  roleIds?: string[];
  assignedRoles?: RoleBadge[];
}

export interface ServerRoleOption extends RoleBadge {
  position: number;
}

interface MemberListProps {
  members: MemberItem[];
  currentUserId: string;
  onAddFriend: (userId: string) => void;
  canKick?: boolean;
  canBan?: boolean;
  canTimeout?: boolean;
  canManageNicknames?: boolean;
  onKickMember?: (member: MemberItem) => void;
  onBanMember?: (member: MemberItem) => void;
  onTimeoutMember?: (member: MemberItem) => void;
  onChangeNickname?: (member: MemberItem) => void;
  onMentionMember?: (member: MemberItem) => void;
  onMessageMember?: (member: MemberItem) => void;
  onQuickMessageMember?: (member: MemberItem, content: string) => Promise<void>;
  immediateMutualServer?: MutualServer | null;
  roles?: ServerRoleOption[];
  canManageRoles?: boolean;
  canManageSelfRoles?: boolean;
  onToggleRole?: (member: MemberItem, role: ServerRoleOption, assigned: boolean) => void;
  mutedSoundEffectUserIds?: string[];
  onToggleSoundEffects?: (userId: string, muted: boolean) => void;
}

export function MemberList({ members, currentUserId, onAddFriend, canKick = false, canBan = false, canTimeout = false, canManageNicknames = false, onKickMember, onBanMember, onTimeoutMember, onChangeNickname, onMentionMember, onMessageMember, onQuickMessageMember, immediateMutualServer, roles = [], canManageRoles = false, canManageSelfRoles = false, onToggleRole, mutedSoundEffectUserIds = [], onToggleSoundEffects }: MemberListProps) {
  const [selected, setSelected] = useState<MemberItem | null>(null);
  const [profilePosition, setProfilePosition] = useState<ProfileCardPosition>({ left: 12, top: 12 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: MemberItem; trigger: HTMLButtonElement } | null>(null);
  const listening = useListeningByUser(members.map((member) => member.id));

  useEffect(() => {
    setSelected((current) => current ? members.find((member) => member.id === current.id) ?? null : null);
  }, [members]);

  function openProfile(member: MemberItem, trigger: HTMLButtonElement) {
    setProfilePosition(getProfileCardPosition(trigger));
    setSelected(member);
  }

  function openMemberContextMenu(member: MemberItem, trigger: HTMLButtonElement, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, member, trigger });
  }
  // Online, ausente e não perturbe ficam no cargo. Offline vai todo para o fim.
  const groups = groupByRole(members.filter((member) => member.status !== "offline"));
  const offlineMembers = members.filter((member) => member.status === "offline");

  return (
    <>
    <div className={cn("member-roster h-full w-60 overflow-y-auto bg-discord-bg-dark px-1.5 py-2", memberFont.className)}>
      {groups.map(({ id, roleName, roleColor, roleInsigniaUrl, members: roleMembers }, index) => (
        <section key={id} className="mb-1">
          <div className={cn("flex min-w-0 items-center gap-1.5 px-2 pb-1", index === 0 ? "pt-1" : "pt-3")}>
            {roleName.toLocaleLowerCase() !== "@everyone" && roleName.toLocaleLowerCase() !== "everyone" && roleName !== "Membro" && (
              <RoleInsignia role={{ id, name: roleName, color: roleColor, insigniaUrl: roleInsigniaUrl }} size="small" />
            )}
            <p className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.06em] text-[#a8b0bb]">
              {roleName} — {roleMembers.length}
            </p>
          </div>
          <div className="space-y-px">
            {roleMembers.map((m) => (
              <MemberRow key={m.id} member={m} listening={m.status === "offline" ? undefined : listening[m.id]} isSelf={m.id === currentUserId} onSelect={openProfile} onContextMenu={openMemberContextMenu} />
            ))}
          </div>
        </section>
      ))}
      {offlineMembers.length > 0 && (
        <section className="mb-1">
          <div className={cn("flex min-w-0 items-center gap-1.5 px-2 pb-1", groups.length === 0 ? "pt-1" : "pt-3")}>
            <p className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.06em] text-[#a8b0bb]">
              Offline — {offlineMembers.length}
            </p>
          </div>
          <div className="space-y-px">
            {offlineMembers.map((m) => (
              <MemberRow key={m.id} member={m} listening={m.status === "offline" ? undefined : listening[m.id]} isSelf={m.id === currentUserId} onSelect={openProfile} onContextMenu={openMemberContextMenu} />
            ))}
          </div>
        </section>
      )}

    </div>
      {selected && <UserProfileCard
        profile={selected}
        position={profilePosition}
        currentUserId={currentUserId}
        onClose={() => setSelected(null)}
        onMessage={onMessageMember ? () => onMessageMember(selected) : undefined}
        onQuickMessage={onQuickMessageMember ? (content) => onQuickMessageMember(selected, content) : undefined}
        onAddFriend={() => onAddFriend(selected.id)}
        onKick={canKick && onKickMember ? () => onKickMember(selected) : undefined}
        roles={roles}
        canManageRoles={canManageRoles && (selected.id !== currentUserId || canManageSelfRoles)}
        immediateMutualServer={immediateMutualServer}
        assignedRoleIds={selected.roleIds ?? []}
        onToggleRole={onToggleRole ? (role, assigned) => onToggleRole(selected, role, assigned) : undefined}
      />}
      {contextMenu && (() => {
        const contextMember = members.find((member) => member.id === contextMenu.member.id) ?? contextMenu.member;
        return <MemberContextMenu
          member={contextMember}
          currentUserId={currentUserId}
          x={contextMenu.x}
          y={contextMenu.y}
          roles={roles}
          canManageRoles={canManageRoles}
          canManageSelfRoles={canManageSelfRoles}
          canManageNicknames={canManageNicknames}
          canTimeout={canTimeout}
          canKick={canKick}
          canBan={canBan}
          onClose={() => setContextMenu(null)}
          onOpenProfile={() => openProfile(contextMember, contextMenu.trigger)}
          onMention={() => onMentionMember?.(contextMember)}
          onMessage={onMessageMember ? () => onMessageMember(contextMember) : undefined}
          onAddFriend={() => onAddFriend(contextMember.id)}
          onChangeNickname={onChangeNickname ? () => onChangeNickname(contextMember) : undefined}
          onTimeout={onTimeoutMember ? () => onTimeoutMember(contextMember) : undefined}
          onKick={onKickMember ? () => onKickMember(contextMember) : undefined}
          onBan={onBanMember ? () => onBanMember(contextMember) : undefined}
          onToggleRole={onToggleRole ? (role, assigned) => onToggleRole(contextMember, role, assigned) : undefined}
          soundEffectsMuted={mutedSoundEffectUserIds.includes(contextMember.id)}
          onToggleSoundEffects={onToggleSoundEffects ? () => onToggleSoundEffects(contextMember.id, !mutedSoundEffectUserIds.includes(contextMember.id)) : undefined}
        />;
      })()}
    </>
  );
}

function groupByRole(members: MemberItem[]): { id: string; roleName: string; roleColor?: string; roleIconUrl?: string | null; roleInsigniaUrl?: string | null; rolePosition: number; members: MemberItem[] }[] {
  const map = new Map<string, { id: string; roleName: string; roleColor?: string; roleIconUrl?: string | null; roleInsigniaUrl?: string | null; rolePosition: number; members: MemberItem[] }>();
  for (const m of members) {
    const id = m.roleId ?? m.roleName;
    const group = map.get(id) ?? {
      id,
      roleName: m.roleName,
      roleColor: m.roleColor,
      roleIconUrl: m.roleIconUrl,
      roleInsigniaUrl: m.roleInsigniaUrl,
      rolePosition: m.rolePosition ?? 0,
      members: [],
    };
    group.members.push(m);
    map.set(id, group);
  }
  return Array.from(map.values()).sort((a, b) => b.rolePosition - a.rolePosition);
}

function MemberRow({ member, listening, isSelf, onSelect, onContextMenu }: { member: MemberItem; listening?: { track: string; artUrl: string }; isSelf: boolean; onSelect: (member: MemberItem, trigger: HTMLButtonElement) => void; onContextMenu: (member: MemberItem, trigger: HTMLButtonElement, event: MouseEvent<HTMLButtonElement>) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button type="button" onContextMenu={(event) => onContextMenu(member, event.currentTarget, event)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} onClick={(event) => onSelect(member, event.currentTarget)} className={cn("group relative flex min-h-[38px] w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-discord-bg-modifier-hover", member.status === "offline" && "opacity-50 hover:opacity-90")}>
      <div className="relative h-8 w-8 shrink-0">
       <div className="relative h-full w-full overflow-hidden rounded-full bg-discord-brand">
        {member.avatarUrl ? (
          <CroppedProfileImage src={member.avatarUrl} alt="" className="rounded-full" isHovered={hovered} positionX={member.avatarPositionX} positionY={member.avatarPositionY} zoom={member.avatarZoom} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-white">
            {member.displayName[0]?.toUpperCase()}
          </div>
        )}
        </div>
        <PresenceIndicator presence={member.status} avatarBadge borderColor="rgb(var(--d-dark))" cutoutColor="rgb(var(--d-dark))" />
      </div>

      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="flex min-w-0 items-center gap-1 leading-4">
          <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.011em]" style={{ color: member.roleColor || "#f2f3f5" }}>{member.displayName}</span>
          <CustomBadgeList badges={member.badges} limit={2} />
        </span>
        {listening ? <ListeningLine track={listening.track} artUrl={listening.artUrl} /> : member.customStatus && <span title={member.customStatus} className="min-w-0 truncate text-[11px] font-medium leading-[14px] tracking-[-0.006em] text-[#b5bac1]">{member.customStatus}</span>}
      </span>
      {!isSelf && <UserPlus className="absolute right-1.5 h-3.5 w-3.5 text-discord-text-muted opacity-0 transition group-hover:opacity-100" />}
    </button>
  );
}
