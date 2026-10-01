"use client";

import { cn } from "@/lib/utils";

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
}

const STATUS_CLASS: Record<MemberItem["status"], string> = {
  online: "status-online",
  idle: "status-idle",
  dnd: "status-dnd",
  offline: "status-offline",
};

export function MemberList({ members }: MemberListProps) {
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
              <MemberRow key={m.id} member={m} />
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
              <MemberRow key={m.id} member={m} />
            ))}
          </div>
        </div>
      )}
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

function MemberRow({ member }: { member: MemberItem }) {
  return (
    <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-discord-bg-modifier-hover">
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
    </button>
  );
}
