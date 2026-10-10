"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlarmClock,
  Bookmark,
  ChevronRight,
  Copy,
  Flag,
  Forward,
  Link2,
  MessageSquarePlus,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Star,
  Trash2,
  Volume2,
} from "lucide-react";
import { QUICK_REACTIONS, STANDARD_EMOJIS, reminderMoment } from "@/lib/messageMenu";

type Flyout = "react" | "forward" | "remind" | null;

export function MessageContextMenu({
  x,
  y,
  canEdit,
  canDelete,
  pinned,
  favorited,
  channels,
  onClose,
  onReact,
  onReply,
  onTopic,
  onForward,
  onCopyText,
  onTogglePin,
  onToggleFavorite,
  onRemind,
  onMarkUnread,
  onCopyLink,
  onSpeak,
  onEdit,
  onDelete,
  onReport,
}: {
  x: number;
  y: number;
  canEdit: boolean;
  canDelete: boolean;
  pinned: boolean;
  favorited: boolean;
  channels: { id: string; name: string }[];
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onTopic: () => void;
  onForward: (channelId: string) => void;
  onCopyText: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onRemind: (at: number) => void;
  onMarkUnread: () => void;
  onCopyLink: () => void;
  onSpeak: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [box, setBox] = useState({ left: x, top: y });
  const [flyoutSide, setFlyoutSide] = useState<"right" | "left">("right");

  useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    setBox({ left, top });
    setFlyoutSide(left + rect.width + 280 > window.innerWidth ? "left" : "right");
  }, [x, y, flyout]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function run(action: () => void) {
    onClose();
    action();
  }

  function toggleFlyout(next: Flyout) {
    setFlyout((current) => current === next ? null : next);
  }

  return createPortal(
    <>
      <button aria-label="Fechar menu da mensagem" className="fixed inset-0 z-[400] cursor-default" onClick={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }} />
      <div
        ref={panelRef}
        role="menu"
        style={{ left: box.left, top: box.top }}
        className="fixed z-[410] w-[248px] rounded-xl border border-white/10 bg-[#111214] p-1.5 text-sm shadow-2xl"
      >
        <div className="mb-1 flex items-center justify-between gap-1 px-1 py-1">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" role="menuitem" aria-label={`Reagir com ${emoji}`} onClick={() => run(() => onReact(emoji))} className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/10">{emoji}</button>
          ))}
        </div>
        <MenuRow icon={<SmilePlus size={16} />} label="Adicionar reação" trailing={<ChevronRight size={14} />} active={flyout === "react"} onClick={() => toggleFlyout("react")} />
        <MenuRow icon={<Reply size={16} />} label="Responder" onClick={() => run(onReply)} />
        <MenuRow icon={<Forward size={16} />} label="Encaminhar" trailing={<ChevronRight size={14} />} active={flyout === "forward"} onClick={() => toggleFlyout("forward")} />
        <MenuRow icon={<MessageSquarePlus size={16} />} label="Criar tópico" onClick={() => run(onTopic)} />
        <div className="my-1 h-px bg-white/10" />
        <MenuRow icon={<Copy size={16} />} label="Copiar texto" onClick={() => run(onCopyText)} />
        <MenuRow icon={pinned ? <PinOff size={16} /> : <Pin size={16} />} label={pinned ? "Desafixar mensagem" : "Fixar mensagem"} onClick={() => run(onTogglePin)} />
        <MenuRow icon={<Star size={16} className={favorited ? "fill-current" : undefined} />} label={favorited ? "Remover dos favoritos" : "Favoritar mensagem"} onClick={() => run(onToggleFavorite)} />
        <MenuRow icon={<AlarmClock size={16} />} label="Criar lembrete" trailing={<ChevronRight size={14} />} active={flyout === "remind"} onClick={() => toggleFlyout("remind")} />
        <div className="my-1 h-px bg-white/10" />
        <MenuRow icon={<Bookmark size={16} />} label="Marcar como não lido" onClick={() => run(onMarkUnread)} />
        <MenuRow icon={<Link2 size={16} />} label="Copiar link da mensagem" onClick={() => run(onCopyLink)} />
        <MenuRow icon={<Volume2 size={16} />} label="Falar mensagem" onClick={() => run(onSpeak)} />
        {canEdit && <MenuRow icon={<Pencil size={16} />} label="Editar mensagem" onClick={() => run(onEdit)} />}
        <div className="my-1 h-px bg-white/10" />
        {canDelete && <MenuRow icon={<Trash2 size={16} />} label="Excluir mensagem" danger onClick={() => run(onDelete)} />}
        <MenuRow icon={<Flag size={16} />} label="Denunciar mensagem" danger onClick={() => run(onReport)} />
        {flyout && (
          <div className={`absolute top-0 z-[420] max-h-[min(360px,calc(100vh-16px))] w-[250px] overflow-y-auto rounded-xl border border-white/10 bg-[#111214] p-2 shadow-2xl ${flyoutSide === "right" ? "left-[calc(100%+8px)]" : "right-[calc(100%+8px)]"}`}>
            {flyout === "react" && (
              <div className="grid grid-cols-6 gap-1">
                {STANDARD_EMOJIS.map((emoji, index) => (
                  <button key={`${emoji}-${index}`} type="button" aria-label={`Reagir com ${emoji}`} onClick={() => run(() => onReact(emoji))} className="grid h-9 w-9 place-items-center rounded-lg text-xl hover:bg-white/10">{emoji}</button>
                ))}
              </div>
            )}
            {flyout === "forward" && (
              channels.length ? channels.map((channel) => (
                <button key={channel.id} type="button" onClick={() => run(() => onForward(channel.id))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-discord-text-normal hover:bg-white/10">
                  <span className="text-discord-text-muted">#</span>
                  <span className="truncate">{channel.name}</span>
                </button>
              )) : <p className="px-2 py-2 text-xs text-discord-text-muted">Nenhum canal de texto.</p>
            )}
            {flyout === "remind" && (
              <div className="space-y-1">
                {([
                  ["15m", "Em 15 minutos"],
                  ["1h", "Em 1 hora"],
                  ["3h", "Em 3 horas"],
                  ["tomorrow", "Amanhã às 9h"],
                ] as const).map(([kind, label]) => (
                  <button key={kind} type="button" onClick={() => run(() => onRemind(reminderMoment(kind)))} className="flex w-full rounded-lg px-2 py-2 text-left text-sm text-discord-text-normal hover:bg-white/10">{label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  danger = false,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  danger?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left ${danger ? "text-red-400 hover:bg-red-500/10" : "text-discord-text-normal hover:bg-white/10"} ${active ? "bg-white/10" : ""}`}>
      <span className={danger ? "text-red-400" : "text-discord-text-muted"}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing && <span className="text-discord-text-muted">{trailing}</span>}
    </button>
  );
}
