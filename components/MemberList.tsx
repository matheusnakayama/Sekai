"use client";

import { cn } from "@/lib/utils";
import { UserPlus, MessageCircle, UserMinus, X } from "lucide-react";
import { useState } from "react";

export interface MemberItem {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
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
  // Offline fica sempre por último; dentro dos online, agrupa por cargo
  const online = members.filter((m) => m.status !== "offline");
  const offline = members.filter((m) => m.status === "offline");

  const groupsOnline = groupByRole(online);

  return (
    <div className="h-full w-60 space-y-4 overflow-y-auto bg-discord-bg-dark px-2 py-4">
      {groupsOnline.map(([roleName, roleMembers]) => (
        <div key={roleName}>
          <p className="px-2 text-xs font-semibold uppercase text-discord-text-muted">
            {roleName} — {roleMembers.length}
          </p>
          <div className="mt-1 space-y-0.5">
            {roleMembers.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === currentUserId} onSelect={setSelected} />
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
              <MemberRow key={m.id} member={m} isSelf={m.id === currentUserId} onSelect={setSelected} />
            ))}
          </div>
        </div>
      )}
      {selected && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <section role="dialog" aria-modal="true" aria-label={`Perfil de ${selected.displayName}`} className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-secondary shadow-2xl">
          <div className="h-20 bg-theme-gradient"/><button onClick={() => setSelected(null)} aria-label="Fechar perfil" className="float-right -mt-16 mr-3 rounded-full bg-black/30 p-2 text-white/80 hover:bg-black/50"><X size={18}/></button>
          <div className="relative -mt-10 px-5"><div className="h-20 w-20 overflow-hidden rounded-full border-4 border-discord-bg-secondary bg-discord-brand">{selected.avatarUrl ? <img src={selected.avatarUrl} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center text-2xl font-bold text-white">{selected.displayName[0]?.toUpperCase()}</span>}</div>
            <div className="mt-3 rounded-xl bg-discord-bg-primary p-4"><h2 className="text-lg font-bold text-discord-header-primary">{selected.displayName}</h2><p className="text-xs text-discord-text-muted">{selected.roleName}</p>
              {!selected.id || selected.id === currentUserId ? null : <div className="mt-4 grid gap-2">
                <button onClick={() => { onMessageMember?.(selected); setSelected(null); }} className="flex items-center gap-2 rounded-lg bg-discord-brand px-3 py-2.5 text-sm font-semibold text-white hover:brightness-110"><MessageCircle size={16}/>Enviar mensagem direta</button>
                <button onClick={() => { onAddFriend(selected.id); setSelected(null); }} className="flex items-center gap-2 rounded-lg bg-discord-bg-secondary px-3 py-2.5 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover"><UserPlus size={16}/>Adicionar amigo</button>
                {canKick && <button onClick={() => { onKickMember?.(selected); setSelected(null); }} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10"><UserMinus size={16}/>Expulsar do servidor</button>}
              </div>}
            </div>
          </div><div className="h-5"/>
        </section>
      </div>}
    </div>
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

function MemberRow({ member, isSelf, onSelect }: { member: MemberItem; isSelf: boolean; onSelect: (member: MemberItem) => void }) {
  return (
    <button type="button" onClick={() => onSelect(member)} className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-discord-bg-modifier-hover">
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-discord-brand">
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
            {member.displayName[0]?.toUpperCase()}
          </div>
        )}
        <span className={cn("status-dot", STATUS_CLASS[member.status])} />
      </div>

      <span
        className="truncate text-sm font-medium"
        style={{ color: member.roleColor || "var(--discord-text-normal)" }}
      >
        {member.displayName}
      </span>
      {!isSelf && <UserPlus className="ml-auto h-4 w-4 shrink-0 text-discord-text-muted opacity-0 transition group-hover:opacity-100" />}
    </button>
  );
}
