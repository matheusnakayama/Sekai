"use client";

import { cn } from "@/lib/utils";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { HoverGifImage } from "@/components/HoverGifImage";
import { getProfileCardPosition, UserProfileCard } from "@/components/UserProfileCard";
import type { ProfileCardPosition } from "@/components/UserProfileCard";
import type { CustomBadge } from "@/lib/badges";
import { UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

export interface MemberItem {
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
  roleColor?: string; // hex, ex: "#f23f43" para Admin
  roleIds?: string[];
}

export interface ServerRoleOption {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

interface MemberListProps {
  members: MemberItem[];
  currentUserId: string;
  onAddFriend: (userId: string) => void;
  canKick?: boolean;
  onKickMember?: (member: MemberItem) => void;
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

export function MemberList({ members, currentUserId, onAddFriend, canKick = false, onKickMember, onMessageMember, roles = [], canManageRoles = false, onToggleRole }: MemberListProps) {
  const [selected, setSelected] = useState<MemberItem | null>(null);
  const [profilePosition, setProfilePosition] = useState<ProfileCardPosition>({ left: 12, top: 12 });

  useEffect(() => {
    setSelected((current) => current ? members.find((member) => member.id === current.id) ?? null : null);
  }, [members]);

  function openProfile(member: MemberItem, trigger: HTMLButtonElement) {
    setProfilePosition(getProfileCardPosition(trigger));
    setSelected(member);
  }
  // Offline fica sempre por último; dentro dos online, agrupa por cargo
  const online = members.filter((m) => m.status !== "offline");
  const offline = members.filter((m) => m.status === "offline");

  const groupsOnline = groupByRole(online);

  return (
    <>
    <div className="h-full w-60 space-y-4 overflow-y-auto bg-discord-bg-dark px-2 py-4">
      {groupsOnline.map(([roleName, roleMembers]) => (
        <div key={roleName}>
          <p className="px-2 text-xs font-semibold uppercase text-discord-text-muted">
            {roleName} — {roleMembers.length}
          </p>
          <div className="mt-1 space-y-0.5">
            {roleMembers.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === currentUserId} onSelect={openProfile} />
            ))}
          </div>
        </div>
      ))}

      {offline.length > 0 && (
        <div>
          <p className="px-2 text-xs font-semibold uppercase text-discord-text-muted">
            Offline — {offline.length}
          </p>
          <div className="mt-1 space-y-0.5 opacity-50">
            {offline.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === currentUserId} onSelect={openProfile} />
            ))}
          </div>
        </div>
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
    </>
  );
}

function groupByRole(members: MemberItem[]): [string, MemberItem[]][] {
  const map = new Map<string, MemberItem[]>();
  for (const m of members) {
    const list = map.get(m.roleName) ?? [];
    list.push(m);
    map.set(m.roleName, list);
  }
  return Array.from(map.entries());
}

function MemberRow({ member, isSelf, onSelect }: { member: MemberItem; isSelf: boolean; onSelect: (member: MemberItem, trigger: HTMLButtonElement) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button type="button" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} onClick={(event) => onSelect(member, event.currentTarget)} className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-discord-bg-modifier-hover">
      <div className="relative h-8 w-8 shrink-0">
       <div className="h-full w-full overflow-hidden rounded-full bg-discord-brand">
        {member.avatarUrl ? (
          <HoverGifImage src={member.avatarUrl} alt="" isHovered={hovered} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
            {member.displayName[0]?.toUpperCase()}
          </div>
        )}
        </div>
        <span className={cn("status-dot", STATUS_CLASS[member.status])} />
      </div>

      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-medium" style={{ color: member.roleColor || "var(--discord-text-normal)" }}>{member.displayName}</span>
        <CustomBadgeList badges={member.badges} limit={2}/>
      </span>
      {!isSelf && <UserPlus className="ml-auto h-4 w-4 shrink-0 text-discord-text-muted opacity-0 transition group-hover:opacity-100" />}
    </button>
  );
}
