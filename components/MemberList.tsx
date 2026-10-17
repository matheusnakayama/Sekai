"use client";

import { cn } from "@/lib/utils";
import type { RoleBadge } from "@/components/RoleBadgeList";
import { RoleInsignia } from "@/components/RoleBadgeList";
import { MemberContextMenu } from "@/components/MemberContextMenu";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { GameActivityLine, ListeningLine, useGameActivityByUser, useListeningByUser } from "@/components/NowPlayingCard";
import { MemberProfileDialog } from "@/components/MemberProfileDialog";
import { getProfileCardPosition, UserProfileCard } from "@/components/UserProfileCard";
import type { MutualServer, ProfileCardPosition } from "@/components/UserProfileCard";
import type { CustomBadge } from "@/lib/badges";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { UserPlus } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { MemberListBannerArt, MemberRowMeta, useMemberListBannerFade } from "@/components/MemberListBannerArt";

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
  activityBannerUrl?: string | null;
  activityBannerPositionX?: number | null;
  activityBannerPositionY?: number | null;
  activityBannerZoom?: number | null;
  memberListBannerUrl?: string | null;
  memberListBannerPositionX?: number | null;
  memberListBannerPositionY?: number | null;
  memberListBannerZoom?: number | null;
  avatarPositionX?: number | null;
  avatarPositionY?: number | null;
  avatarZoom?: number | null;
  profileCardColor?: string | null;
  profileDecoration?: string | null;
  badges?: CustomBadge[];
  showBadgesInMemberList?: boolean;
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

export interface MemberVoiceActivity {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  participants: Array<{ id: string; name: string; avatarUrl?: string | null }>;
}

interface MemberListProps {
  members: MemberItem[];
  currentUserId: string;
  onAddFriend: (userId: string) => void;
  canKick?: boolean;
  canBan?: boolean;
  canTimeout?: boolean;
  canDisconnectFromVoice?: boolean;
  voiceMemberIds?: string[];
  canManageNicknames?: boolean;
  onKickMember?: (member: MemberItem) => void;
  onBanMember?: (member: MemberItem) => void;
  onTimeoutMember?: (member: MemberItem) => void;
  onDisconnectMemberFromVoice?: (member: MemberItem) => void;
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
  voiceActivityByUser?: Record<string, MemberVoiceActivity>;
  onOpenVoiceActivity?: (activity: MemberVoiceActivity) => void;
  onOpenSettings?: () => void;
}

export function MemberList({ members, currentUserId, onAddFriend, canKick = false, canBan = false, canTimeout = false, canDisconnectFromVoice = false, voiceMemberIds = [], canManageNicknames = false, onKickMember, onBanMember, onTimeoutMember, onDisconnectMemberFromVoice, onChangeNickname, onMentionMember, onMessageMember, onQuickMessageMember, immediateMutualServer, roles = [], canManageRoles = false, canManageSelfRoles = false, onToggleRole, mutedSoundEffectUserIds = [], onToggleSoundEffects, voiceActivityByUser = {}, onOpenVoiceActivity, onOpenSettings }: MemberListProps) {
  const [selected, setSelected] = useState<MemberItem | null>(null);
  const [quickProfile, setQuickProfile] = useState<{ member: MemberItem; position: ProfileCardPosition } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: MemberItem; anchor: HTMLElement } | null>(null);
  const listening = useListeningByUser(members.map((member) => member.id));
  const gameActivities = useGameActivityByUser(members.filter((member) => member.status !== "offline").map((member) => member.id));

  useEffect(() => {
    setSelected((current) => current ? members.find((member) => member.id === current.id) ?? null : null);
    setQuickProfile((current) => {
      if (!current) return null;
      const member = members.find((item) => item.id === current.member.id);
      return member ? { ...current, member } : null;
    });
  }, [members]);

  function openQuickProfile(member: MemberItem, anchor: HTMLElement) {
    setSelected(null);
    setQuickProfile({ member, position: getProfileCardPosition(anchor) });
  }

  function openFullProfile(member: MemberItem) {
    setQuickProfile(null);
    setSelected(member);
  }

  function openMemberContextMenu(member: MemberItem, event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, member, anchor: event.currentTarget });
  }
  // Online, ausente e não perturbe ficam no cargo. Offline vai todo para o fim.
  const groups = groupByRole(members.filter((member) => member.status !== "offline"));
  const offlineMembers = members.filter((member) => member.status === "offline");

  return (
    <>
    <div className={cn("member-roster h-full w-60 overflow-y-auto bg-discord-bg-dark px-1.5 py-2")}>
      {groups.map(({ id, roleName, roleColor, roleInsigniaUrl, members: roleMembers }, index) => (
        <section key={id} className="mb-1">
          <div className={cn("flex min-w-0 items-center gap-1.5 px-2 pb-1", index === 0 ? "pt-1" : "pt-3")}>
            {roleName.toLocaleLowerCase() !== "@everyone" && roleName.toLocaleLowerCase() !== "everyone" && roleName !== "Membro" && (
              <RoleInsignia role={{ id, name: roleName, color: roleColor, insigniaUrl: roleInsigniaUrl }} size="small" />
            )}
            <p className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
              {roleName} — {roleMembers.length}
            </p>
          </div>
          <div className="space-y-px">
            {roleMembers.map((m) => (
              <MemberRow key={m.id} member={m} listening={m.status === "offline" ? undefined : listening[m.id]} gameActivity={m.status === "offline" ? undefined : gameActivities[m.id]} isSelf={m.id === currentUserId} onSelect={openQuickProfile} onContextMenu={openMemberContextMenu} />
            ))}
          </div>
        </section>
      ))}
      {offlineMembers.length > 0 && (
        <section className="mb-1">
          <div className={cn("flex min-w-0 items-center gap-1.5 px-2 pb-1", groups.length === 0 ? "pt-1" : "pt-3")}>
            <p className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
              Offline — {offlineMembers.length}
            </p>
          </div>
          <div className="space-y-px">
            {offlineMembers.map((m) => (
              <MemberRow key={m.id} member={m} listening={m.status === "offline" ? undefined : listening[m.id]} gameActivity={m.status === "offline" ? undefined : gameActivities[m.id]} isSelf={m.id === currentUserId} onSelect={openQuickProfile} onContextMenu={openMemberContextMenu} />
            ))}
          </div>
        </section>
      )}

    </div>
      {quickProfile && <UserProfileCard
        profile={quickProfile.member}
        position={quickProfile.position}
        currentUserId={currentUserId}
        onClose={() => setQuickProfile(null)}
        onMessage={onMessageMember ? () => onMessageMember(quickProfile.member) : undefined}
        onQuickMessage={onQuickMessageMember ? (content) => onQuickMessageMember(quickProfile.member, content) : undefined}
        onAddFriend={() => onAddFriend(quickProfile.member.id)}
        onKick={canKick && onKickMember ? () => onKickMember(quickProfile.member) : undefined}
        roles={roles}
        assignedRoleIds={quickProfile.member.assignedRoles?.map((role) => role.id)}
        canManageRoles={canManageRoles && (quickProfile.member.id !== currentUserId || canManageSelfRoles)}
        immediateMutualServer={immediateMutualServer}
        onOpenSettings={quickProfile.member.id === currentUserId ? onOpenSettings : undefined}
        onToggleRole={onToggleRole ? (role, assigned) => onToggleRole(quickProfile.member, role, assigned) : undefined}
        onOpenFullProfile={() => openFullProfile(quickProfile.member)}
      />}
      {selected && <MemberProfileDialog
        profile={selected}
        currentUserId={currentUserId}
        onClose={() => setSelected(null)}
        onMessage={onMessageMember ? () => onMessageMember(selected) : undefined}
        onQuickMessage={onQuickMessageMember ? (content) => onQuickMessageMember(selected, content) : undefined}
        onOpenSettings={selected.id === currentUserId ? onOpenSettings : undefined}
        voiceActivity={voiceActivityByUser[selected.id]}
        onOpenVoiceActivity={onOpenVoiceActivity}
        onAddFriend={() => onAddFriend(selected.id)}
        onKick={canKick && onKickMember ? () => onKickMember(selected) : undefined}
        roles={roles}
        canManageRoles={canManageRoles && (selected.id !== currentUserId || canManageSelfRoles)}
        immediateMutualServer={immediateMutualServer}
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
          canDisconnectFromVoice={canDisconnectFromVoice}
          memberInVoice={voiceMemberIds.includes(contextMember.id)}
          onClose={() => setContextMenu(null)}
          onOpenProfile={() => openQuickProfile(contextMember, contextMenu.anchor)}
          onMention={() => onMentionMember?.(contextMember)}
          onMessage={onMessageMember ? () => onMessageMember(contextMember) : undefined}
          onAddFriend={() => onAddFriend(contextMember.id)}
          onChangeNickname={onChangeNickname ? () => onChangeNickname(contextMember) : undefined}
          onTimeout={onTimeoutMember ? () => onTimeoutMember(contextMember) : undefined}
          onKick={onKickMember ? () => onKickMember(contextMember) : undefined}
          onBan={onBanMember ? () => onBanMember(contextMember) : undefined}
          onDisconnectFromVoice={onDisconnectMemberFromVoice ? () => onDisconnectMemberFromVoice(contextMember) : undefined}
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

function MemberRow({ member, listening, gameActivity, isSelf, onSelect, onContextMenu }: { member: MemberItem; listening?: { track: string; artUrl: string }; gameActivity?: import("@/components/NowPlayingCard").GameActivity; isSelf: boolean; onSelect: (member: MemberItem, anchor: HTMLElement) => void; onContextMenu: (member: MemberItem, event: MouseEvent<HTMLDivElement>) => void }) {
  const [hovered, setHovered] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const hasBanner = Boolean(member.memberListBannerUrl);
  const fade = useMemberListBannerFade(rowRef, nameRef, hasBanner, member.displayName);

  return (
    <div ref={rowRef} role="button" tabIndex={0} aria-label={`Abrir cartão de ${member.displayName}`} onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(member, event.currentTarget); } }} onContextMenu={(event) => onContextMenu(member, event)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} onClick={(event) => onSelect(member, event.currentTarget)} className={cn("group relative isolate flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md px-1.5 py-1 text-left transition-colors duration-200 hover:bg-white/[0.045] focus-visible:outline focus-visible:outline-2 focus-visible:outline-discord-brand", hasBanner ? "min-h-[46px]" : "min-h-[38px]", member.status === "offline" && "opacity-50 hover:opacity-90")}>
      {member.memberListBannerUrl && <MemberListBannerArt src={member.memberListBannerUrl} positionX={member.memberListBannerPositionX} positionY={member.memberListBannerPositionY} zoom={member.memberListBannerZoom} nameEnd={fade.nameEnd} rowWidth={fade.rowWidth} rowHeight={fade.rowHeight} hovered={hovered} />}
      <button type="button" onClick={(event) => { event.stopPropagation(); onSelect(member, rowRef.current ?? event.currentTarget); }} aria-label={`Abrir cartão de ${member.displayName}`} title={`Abrir cartão de ${member.displayName}`} className={cn("relative z-10 h-8 w-8 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-discord-brand", hasBanner && "shadow-[0_0_0_2px_rgba(0,0,0,.5),0_2px_8px_rgba(0,0,0,.35)]")}>
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
      </button>

      <span className="relative z-10 flex min-w-0 flex-1 flex-col justify-center">
        <span className="flex min-w-0 items-center gap-1 leading-4">
          <span ref={nameRef} className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.011em]" style={{ color: member.roleColor || "#f2f3f5" }}>{member.displayName}</span>
          {member.showBadgesInMemberList !== false && <CustomBadgeList badges={member.badges} limit={3} respectMemberListVisibility />}
        </span>
        <MemberRowMeta banner={hasBanner}>
          {gameActivity ? <GameActivityLine activity={gameActivity} /> : listening ? <ListeningLine track={listening.track} artUrl={listening.artUrl} /> : member.customStatus && <span title={member.customStatus} className="min-w-0 truncate text-[11px] font-medium leading-[14px] tracking-[-0.006em] text-[#b5bac1]">{member.customStatus}</span>}
        </MemberRowMeta>
      </span>
      {!isSelf && <UserPlus className="absolute right-1.5 z-10 h-3.5 w-3.5 text-discord-text-muted opacity-0 transition group-hover:opacity-100" />}
    </div>
  );
}
