"use client";

import { cn } from "@/lib/utils";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import type { CustomBadge } from "@/lib/badges";
import { UserPlus, MessageCircle, UserMinus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
}

interface MemberListProps {
  members: MemberItem[];
  currentUserId: string;
  onAddFriend: (userId: string) => void;
  canKick?: boolean;
  onKickMember?: (member: MemberItem) => void;
  onMessageMember?: (member: MemberItem) => void;
}

const STATUS_CLASS: Record<MemberItem["status"], string> = {
  online: "status-online",
  idle: "status-idle",
  dnd: "status-dnd",
  offline: "status-offline",
};

export function MemberList({ members, currentUserId, onAddFriend, canKick = false, onKickMember, onMessageMember }: MemberListProps) {
  const [selected, setSelected] = useState<MemberItem | null>(null);
  const [profilePosition, setProfilePosition] = useState({ left: 12, top: 12 });
  const profileRef = useRef<HTMLElement>(null);

  function openProfile(member: MemberItem, trigger: HTMLButtonElement) {
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const estimatedHeight = Math.min(560, window.innerHeight - 24);
    setProfilePosition({
      left: Math.max(12, Math.min(bounds.left - width - 12, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(bounds.top - 42, window.innerHeight - estimatedHeight - 12)),
    });
    setSelected(member);
  }

  useEffect(() => {
    if (!selected) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setSelected(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);
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
      {selected && createPortal(<section ref={profileRef} role="dialog" aria-label={`Perfil de ${selected.displayName}`} style={{ left: profilePosition.left, top: profilePosition.top, backgroundColor: selected.profileCardColor || undefined }} className="profile-card-enter fixed z-[150] max-h-[calc(100dvh-24px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-discord-bg-secondary shadow-2xl">
          <div className="relative h-28 bg-theme-gradient bg-cover bg-center" style={selected.bannerUrl ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.1),rgba(0,0,0,.1)),url("${selected.bannerUrl}")` } : undefined}><button onClick={() => setSelected(null)} aria-label="Fechar perfil" className="absolute right-3 top-3 rounded-full bg-black/35 p-2 text-white/80 transition hover:bg-black/60"><X size={18}/></button></div>
          <div className="relative -mt-10 px-5"><div className="relative h-20 w-20"><div className="h-full w-full overflow-hidden rounded-full border-4 border-discord-bg-secondary bg-discord-brand shadow-lg">{selected.avatarUrl ? <img src={selected.avatarUrl} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center text-2xl font-bold text-white">{selected.displayName[0]?.toUpperCase()}</span>}</div><span className={cn("status-dot", STATUS_CLASS[selected.status])}/></div>
            <div className="mt-3 rounded-xl bg-black/15 p-4"><div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><h2 className="max-w-full truncate text-lg font-bold text-discord-header-primary">{selected.displayName}</h2><CustomBadgeList badges={selected.badges} limit={5} size="medium"/></div><div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-discord-text-muted"><span>@{selected.username || selected.id.slice(0, 8)}</span>{selected.pronouns && <><span>·</span><span>{selected.pronouns}</span></>}</div><p className="mt-2 text-xs font-medium text-discord-text-muted">{selected.roleName}</p>
              {selected.customStatus && <p className="mt-3 rounded-lg bg-discord-bg-secondary px-3 py-2 text-sm text-discord-text-normal">{selected.customStatus}</p>}
              {selected.bio && <div className="mt-3 border-t border-white/5 pt-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-discord-text-muted">Sobre mim</p><p className="whitespace-pre-wrap break-words text-sm leading-5 text-discord-text-normal">{selected.bio}</p></div>}
              {!selected.id || selected.id === currentUserId ? null : <div className="mt-4 grid gap-2">
                <button onClick={() => { onMessageMember?.(selected); setSelected(null); }} className="flex items-center gap-2 rounded-lg bg-discord-brand px-3 py-2.5 text-sm font-semibold text-white hover:brightness-110"><MessageCircle size={16}/>Enviar mensagem direta</button>
                <button onClick={() => { onAddFriend(selected.id); setSelected(null); }} className="flex items-center gap-2 rounded-lg bg-discord-bg-secondary px-3 py-2.5 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover"><UserPlus size={16}/>Adicionar amigo</button>
                {canKick && <button onClick={() => { onKickMember?.(selected); setSelected(null); }} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10"><UserMinus size={16}/>Expulsar do servidor</button>}
              </div>}
            </div>
          </div><div className="h-5"/>
        </section>, document.body)}
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
  return (
    <button type="button" onClick={(event) => onSelect(member, event.currentTarget)} className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-discord-bg-modifier-hover">
      <div className="relative h-8 w-8 shrink-0">
       <div className="h-full w-full overflow-hidden rounded-full bg-discord-brand">
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
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
