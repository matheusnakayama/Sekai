"use client";

import { Plus, Compass } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { SEKAI_LOGO_MONOCHROME } from "@/lib/brandAssets";
import { cn } from "@/lib/utils";

export interface ServerItem {
  id: string;
  name: string;
  iconUrl?: string | null;
  hasUnread?: boolean;
  mentionCount?: number;
}

interface ServerSidebarProps {
  currentUserId: string;
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
  currentUserId,
  servers,
  activeServerId,
  onSelectServer,
  onCreateServer,
  onExploreServers,
  onOpenHome,
  onServerContext,
}: ServerSidebarProps) {
  const [serverOrder, setServerOrder] = useState<string[]>([]);
  const [draggedServerId, setDraggedServerId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUserId) {
      setServerOrder([]);
      return;
    }
    try {
      const savedOrder = JSON.parse(localStorage.getItem(`sekai-server-order:${currentUserId}`) ?? "[]");
      setServerOrder(Array.isArray(savedOrder) ? savedOrder.filter((id): id is string => typeof id === "string") : []);
    } catch {
      setServerOrder([]);
    }
  }, [currentUserId]);

  const orderedServers = useMemo(() => {
    const byId = new Map(servers.map((server) => [server.id, server]));
    const saved = serverOrder.flatMap((id) => {
      const server = byId.get(id);
      return server ? [server] : [];
    });
    const savedIds = new Set(saved.map((server) => server.id));
    return [...saved, ...servers.filter((server) => !savedIds.has(server.id))];
  }, [servers, serverOrder]);

  function reorderServer(targetId: string, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedServerId;
    if (!sourceId || sourceId === targetId || !orderedServers.some((server) => server.id === sourceId)) return;

    const next = orderedServers.map((server) => server.id).filter((id) => id !== sourceId);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex < 0) return;
    const targetBounds = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientY > targetBounds.top + targetBounds.height / 2;
    next.splice(targetIndex + (insertAfter ? 1 : 0), 0, sourceId);
    setServerOrder(next);
    try {
      localStorage.setItem(`sekai-server-order:${currentUserId}`, JSON.stringify(next));
    } catch {
      // Keep the in-memory order if browser storage is unavailable.
    }
    setDraggedServerId(null);
  }

  return (
    <div className="flex h-full w-24 shrink-0 flex-col gap-2 overflow-x-hidden bg-discord-bg-darkest py-3">
      {/* Botão "Início" (DM) */}
      <ServerIcon active={!activeServerId} onClick={() => { onSelectServer(""); onOpenHome?.(); }} label="Mensagens diretas">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SEKAI_LOGO_MONOCHROME} alt="" aria-hidden="true" className="h-8 w-9 object-contain brightness-0 invert" />
      </ServerIcon>

      <div className="mx-auto my-1 h-[2px] w-8 rounded-full bg-discord-bg-dark" />

      <div className="flex w-full flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto">
        {orderedServers.map((server) => (
          <div
            key={server.id}
            draggable
            onDragStart={(event) => { setDraggedServerId(server.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", server.id); }}
            onDragEnd={() => setDraggedServerId(null)}
            onDragOver={(event) => { if (draggedServerId) event.preventDefault(); }}
            onDrop={(event) => reorderServer(server.id, event)}
            className={cn("w-full cursor-grab active:cursor-grabbing", draggedServerId === server.id && "opacity-40")}
            onContextMenu={(event) => { event.preventDefault(); onServerContext?.(server.id); }}
          >
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
