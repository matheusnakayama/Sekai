"use client";

import { Plus, Compass } from "lucide-react";
import { createPortal } from "react-dom";
import { useState } from "react";
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
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number; maxWidth: number } | null>(null);

  function showTooltip(button: HTMLButtonElement) {
    const bounds = button.getBoundingClientRect();
    const left = Math.min(bounds.right + 12, Math.max(8, window.innerWidth - 180));
    setTooltipPosition({ left, top: bounds.top + bounds.height / 2, maxWidth: Math.max(120, window.innerWidth - left - 16) });
  }

  return (
    <div className="group relative flex h-12 w-full items-center justify-center">
      {/* Indicador de pílula à esquerda (ativo = mais alta, hover = média) */}
      <span
        className={cn(
          "server-rail-pill absolute left-0 w-[5px] rounded-r-full",
          active ? "server-rail-pill-active h-10" : hasUnread ? "server-rail-pill-unread h-2" : "h-0 group-hover:h-5"
        )}
      />

      <div className={cn("relative shrink-0 transition-transform duration-150", active && "translate-x-1")}>
        <button
          onClick={onClick}
          aria-label={label}
          onMouseEnter={(event) => showTooltip(event.currentTarget)}
          onMouseLeave={() => setTooltipPosition(null)}
          onFocus={(event) => showTooltip(event.currentTarget)}
          onBlur={() => setTooltipPosition(null)}
          className={cn(
            "server-icon-button flex h-12 w-12 items-center justify-center overflow-hidden",
            "bg-discord-bg-dark text-discord-text-normal hover:bg-discord-brand hover:bg-theme-gradient hover:text-white",
            active ? "rounded-2xl bg-discord-brand bg-theme-gradient text-white" : "rounded-3xl hover:rounded-2xl"
          )}
        >
          {children}
        </button>
        {mentionCount ? (
          <span className="absolute -bottom-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full border-[3px] border-discord-bg-darkest bg-discord-danger px-1 text-[11px] font-bold leading-none text-white">
            {mentionCount > 99 ? "99+" : mentionCount}
          </span>
        ) : null}
      </div>

      {tooltipPosition && createPortal(
        <div
          role="tooltip"
          style={{ left: tooltipPosition.left, top: tooltipPosition.top, maxWidth: tooltipPosition.maxWidth }}
          className="server-name-tooltip-enter pointer-events-none fixed z-[500] -translate-y-1/2 rounded-md bg-[#111214] px-3 py-2 text-sm font-semibold leading-5 text-[#f2f3f5] shadow-[0_8px_24px_rgba(0,0,0,.45)]"
        >
          <span aria-hidden="true" className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-[#111214]" />
          <span className="relative block truncate">{label}</span>
        </div>,
        document.body,
      )}
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
    <div className="flex h-full w-24 shrink-0 flex-col gap-2 overflow-x-hidden bg-discord-bg-darkest py-3">
      {/* Botão "Início" (DM) */}
      <ServerIcon active={!activeServerId} onClick={() => { onSelectServer(""); onOpenHome?.(); }} label="Mensagens diretas">
        <span className="text-lg font-bold">S</span>
      </ServerIcon>

      <div className="mx-auto my-1 h-[2px] w-8 rounded-full bg-discord-bg-dark" />

      <div className="flex w-full flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto">
        {servers.map((server) => (
          <div key={server.id} className="w-full" onContextMenu={(event) => { event.preventDefault(); onServerContext?.(server.id); }}>
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
