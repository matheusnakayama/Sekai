"use client";

import { Plus, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ServerItem {
  id: string;
  name: string;
  iconUrl?: string | null;
  hasUnread?: boolean;
  mentionCount?: number;
}

interface ServerSidebarProps {
  servers: ServerItem[];
  activeServerId?: string;
  onSelectServer: (serverId: string) => void;
  onCreateServer: () => void;
  onExploreServers?: () => void;
  onOpenHome?: () => void;
  onServerContext?: (serverId: string) => void;
}

function ServerIcon({
  active,
  hasUnread,
  mentionCount,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  hasUnread?: boolean;
  mentionCount?: number;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="group relative flex items-center justify-center">
      {/* Indicador de pílula à esquerda (ativo = mais alta, hover = média) */}
      <span
        className={cn(
          "absolute left-0 w-1 rounded-r-full bg-white transition-all duration-150 ease-out",
          active ? "h-10" : hasUnread ? "h-2" : "h-0 group-hover:h-5"
        )}
      />

      <button
        onClick={onClick}
        title={label}
        className={cn(
          "flex h-12 w-12 items-center justify-center overflow-hidden transition-[background-color,border-radius,transform,color] duration-150 ease-out active:scale-[0.96]",
          "bg-discord-bg-dark text-discord-text-normal hover:bg-discord-brand hover:bg-theme-gradient hover:text-white",
          active ? "rounded-2xl bg-discord-brand bg-theme-gradient text-white" : "rounded-3xl hover:rounded-2xl"
        )}
      >
        {children}
      </button>

      {mentionCount ? (
        <span className="absolute -bottom-1 right-0 flex h-5 min-w-5 items-center justify-center rounded-full border-[3px] border-discord-bg-darkest bg-discord-danger px-1 text-[11px] font-bold text-white">
          {mentionCount > 99 ? "99+" : mentionCount}
        </span>
      ) : null}
    </div>
  );
}

export function ServerSidebar({
  servers,
  activeServerId,
  onSelectServer,
  onCreateServer,
  onExploreServers,
  onOpenHome,
  onServerContext,
}: ServerSidebarProps) {
  return (
    <div className="flex h-full w-[72px] flex-col items-center gap-2 bg-discord-bg-darkest py-3">
      {/* Botão "Início" (DM) */}
      <ServerIcon active={!activeServerId} onClick={() => { onSelectServer(""); onOpenHome?.(); }} label="Mensagens diretas">
        <span className="text-lg font-bold">S</span>
      </ServerIcon>

      <div className="my-1 h-[2px] w-8 rounded-full bg-discord-bg-dark" />

      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {servers.map((server) => (
          <div key={server.id} onContextMenu={(event) => { event.preventDefault(); onServerContext?.(server.id); }}>
          <ServerIcon
            active={server.id === activeServerId}
            hasUnread={server.hasUnread}
            mentionCount={server.mentionCount}
            onClick={() => onSelectServer(server.id)}
            label={server.name}
          >
            {server.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={server.iconUrl} alt={server.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold">
                {server.name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            )}
          </ServerIcon>
          </div>
        ))}
      </div>

      <ServerIcon onClick={onCreateServer} label="Adicionar servidor">
        <Plus className="h-6 w-6 text-discord-online group-hover:text-white" />
      </ServerIcon>

      {onExploreServers && (
        <ServerIcon onClick={onExploreServers} label="Explorar servidores">
          <Compass className="h-6 w-6 text-discord-online group-hover:text-white" />
        </ServerIcon>
      )}
    </div>
  );
}
