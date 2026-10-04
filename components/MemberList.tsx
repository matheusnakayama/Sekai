"use client";

import { cn } from "@/lib/utils";
import type { RoleBadge } from "@/components/RoleBadgeList";
import { MemberContextMenu } from "@/components/MemberContextMenu";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { getProfileCardPosition, UserProfileCard } from "@/components/UserProfileCard";
import type { ProfileCardPosition } from "@/components/UserProfileCard";
import type { CustomBadge } from "@/lib/badges";
import { UserPlus } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";

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
  roleName: string;
  roleColor?: string; // hex, ex: "#f23f43" para Admin
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
  roles?: ServerRoleOption[];
  canManageRoles?: boolean;
  onToggleRole?: (member: MemberItem, role: ServerRoleOption, assigned: boolean) => void;
}

const STATUS_CLASS: Record<MemberItem["status"], string> = {
  online: "status-online",
  idle: "status-idle",
  dnd: "status-dnd",
  offline: "status-offline",
};

export function MemberList({ members, currentUserId, onAddFriend, canKick = false, canBan = false, canTimeout = false, canManageNicknames = false, onKickMember, onBanMember, onTimeoutMember, onChangeNickname, onMentionMember, onMessageMember, roles = [], canManageRoles = false, onToggleRole }: MemberListProps) {
  const [selected, setSelected] = useState<MemberItem | null>(null);
  const [profilePosition, setProfilePosition] = useState<ProfileCardPosition>({ left: 12, top: 12 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: MemberItem; trigger: HTMLButtonElement } | null>(null);

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
  // Offline fica sempre por último; dentro dos online, agrupa por cargo
  const online = members.filter((m) => m.status !== "offline");
  const offline = members.filter((m) => m.status === "offline");

  const groupsOnline = groupByRole(online);

  return (
    <>
    <div className="h-full w-60 overflow-y-auto bg-discord-bg-dark px-2 py-2">
      {groupsOnline.map(({ roleName, members: roleMembers }) => (
        <section key={roleName} className="mb-3">
          <div className="flex items-center px-2 py-2">
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-discord-text-muted">
              {roleName} — {roleMembers.length}
            </p>
          </div>
          <div className="space-y-0.5">
            {roleMembers.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === currentUserId} onSelect={openProfile} onContextMenu={openMemberContextMenu} />
            ))}
          </div>
        </section>
      ))}

      {offline.length > 0 && (
        <section className="mt-2">
          <div className="flex items-center px-2 py-2">
            <p className="text-xs font-medium text-discord-text-muted">Offline — {offline.length}</p>
          </div>
          <div className="space-y-0.5 opacity-55">
            {offline.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === currentUserId} onSelect={openProfile} onContextMenu={openMemberContextMenu} />
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
        onAddFriend={() => onAddFriend(selected.id)}
        onKick={canKick && onKickMember ? () => onKickMember(selected) : undefined}
        roles={roles}
        canManageRoles={canManageRoles && selected.id !== currentUserId}
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
        />;
      })()}
    </>
  );
}

function groupByRole(members: MemberItem[]): { roleName: string; members: MemberItem[] }[] {
  const map = new Map<string, { roleName: string; members: MemberItem[] }>();
  for (const m of members) {
    const group = map.get(m.roleName) ?? { roleName: m.roleName, members: [] };
    group.members.push(m);
    map.set(m.roleName, group);
  }
  return Array.from(map.values());
}

function MemberRow({ member, isSelf, onSelect, onContextMenu }: { member: MemberItem; isSelf: boolean; onSelect: (member: MemberItem, trigger: HTMLButtonElement) => void; onContextMenu: (member: MemberItem, trigger: HTMLButtonElement, event: MouseEvent<HTMLButtonElement>) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button type="button" onContextMenu={(event) => onContextMenu(member, event.currentTarget, event)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} onClick={(event) => onSelect(member, event.currentTarget)} className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-discord-bg-modifier-hover">
      <div className="relative h-8 w-8 shrink-0">
       <div className="relative h-full w-full overflow-hidden rounded-full bg-discord-brand">
        {member.avatarUrl ? (
          <CroppedProfileImage src={member.avatarUrl} alt="" className="rounded-full" isHovered={hovered} positionX={member.avatarPositionX} positionY={member.avatarPositionY} zoom={member.avatarZoom} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
            {member.displayName[0]?.toUpperCase()}
          </div>
        )}
        </div>
        <span className={cn("status-dot", STATUS_CLASS[member.status])} />
      </div>

      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="min-w-0 truncate text-sm font-medium leading-5" style={{ color: member.roleColor || "var(--discord-text-normal)" }}>{member.displayName}</span>
        {member.customStatus && <span title={member.customStatus} className="min-w-0 truncate text-xs leading-4 text-discord-text-muted">{member.customStatus}</span>}
      </span>
      {!isSelf && <UserPlus className="ml-auto h-4 w-4 shrink-0 text-discord-text-muted opacity-0 transition group-hover:opacity-100" />}
    </button>
  );
}
