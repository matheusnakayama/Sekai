"use client";

import { useMemo, useState } from "react";
import { Hash, Plus, Smile, SendHorizontal, Pencil, Trash2, X, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  attachmentUrl?: string | null;
  createdAt: string; // ISO
  reactions?: { emoji: string; count: number; reactedByMe?: boolean }[];
}

export interface SlashCommand {
  name: string; // ex: "kick"
  description: string;
  usage?: string; // ex: "/kick @usuario"
}

interface ChatAreaProps {
  channelName: string;
  messages: ChatMessage[];
  slashCommands: SlashCommand[];
  onSendMessage: (content: string) => void;
  onUploadFile?: () => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  canManageMessages?: boolean;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ChatArea({
  channelName,
  messages,
  slashCommands,
  onSendMessage,
  onUploadFile,
  onToggleReaction,
  currentUserId,
  onEditMessage,
  onDeleteMessage,
  canManageMessages = false,
}: ChatAreaProps) {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);

  const showAutocomplete = draft.startsWith("/") && draft.length > 0;
  const filteredCommands = useMemo(() => {
    if (!showAutocomplete) return [];
    const query = draft.slice(1).toLowerCase();
    return slashCommands.filter((cmd) => cmd.name.toLowerCase().startsWith(query));
  }, [draft, showAutocomplete, slashCommands]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setDraft("");
  }

  function pickCommand(name: string) {
    setDraft(`/${name} `);
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-discord-bg-primary">
      {/* Cabeçalho do canal */}
      <div className="flex h-12 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <Hash className="h-5 w-5 text-discord-text-muted" />
        <span className="font-semibold text-discord-header-primary">{channelName}</span>
      </div>

      {/* Feed de mensagens */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div key={message.id} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, message }); }} className="group flex gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.035]">
            <div className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-discord-brand">
              {message.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={message.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                  {message.authorName[0]?.toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-discord-header-primary">{message.authorName}</span>
                <span className="text-xs text-discord-text-muted">{formatTime(message.createdAt)}</span>
              </div>

              {editing?.id === message.id ? <div className="mt-1 flex gap-2"><input autoFocus value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} className="min-w-0 flex-1 rounded-lg bg-discord-bg-dark px-3 py-2 text-sm text-discord-text-normal outline-none ring-1 ring-brand-500"/><button title="Salvar" onClick={async () => { await onEditMessage?.(message.id, editing.content); setEditing(null); }} className="rounded-lg bg-discord-brand p-2 text-white"><Check size={16}/></button><button title="Cancelar" onClick={() => setEditing(null)} className="rounded-lg bg-discord-bg-secondary p-2"><X size={16}/></button></div> : <div className="prose prose-invert max-w-none text-sm text-discord-text-normal prose-p:my-0 prose-code:text-discord-text-normal"><ReactMarkdown>{message.content}</ReactMarkdown></div>}

              {message.attachmentUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.attachmentUrl}
                  alt="anexo"
                  className="mt-2 max-h-80 rounded-lg border border-black/20"
                />
              )}

              {message.reactions && message.reactions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {message.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      onClick={() => onToggleReaction?.(message.id, r.emoji)}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                        r.reactedByMe
                          ? "border-discord-brand bg-discord-brand/20 text-discord-brand"
                          : "border-transparent bg-discord-bg-secondary text-discord-text-normal hover:border-discord-text-muted"
                      )}
                    >
                      <span>{r.emoji}</span>
                      <span>{r.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {menu && <><button aria-label="Fechar menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenu(null)} /><div style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 130) }} className="fixed z-50 w-52 rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 shadow-2xl backdrop-blur-xl">
        {menu.message.authorId === currentUserId && <button onClick={() => { setEditing({ id: menu.message.id, content: menu.message.content }); setMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-discord-text-normal hover:bg-white/10"><Pencil size={15}/>Editar mensagem</button>}
        {(menu.message.authorId === currentUserId || canManageMessages) && <button onClick={async () => { if (window.confirm("Excluir esta mensagem?")) await onDeleteMessage?.(menu.message.id); setMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"><Trash2 size={15}/>Excluir mensagem</button>}
      </div></>}

      {/* Campo de mensagem */}
      <div className="relative mx-4 mb-6">
        {showAutocomplete && filteredCommands.length > 0 && (
          <div className="absolute bottom-[calc(100%+8px)] w-full overflow-hidden rounded-lg bg-discord-bg-floating shadow-xl">
            <div className="border-b border-black/30 px-3 py-2 text-xs font-semibold uppercase text-discord-text-muted">
              Comandos com barra
            </div>
            {filteredCommands.map((cmd) => (
              <button
                key={cmd.name}
                onClick={() => pickCommand(cmd.name)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-discord-bg-modifier-hover"
              >
                <span className="font-medium text-discord-header-primary">/{cmd.name}</span>
                <span className="truncate pl-3 text-xs text-discord-text-muted">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-lg bg-discord-bg-secondary px-4 py-2.5"
        >
          <button type="button" onClick={onUploadFile} className="text-discord-text-muted hover:text-discord-text-normal">
            <Plus className="h-5 w-5" />
          </button>

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Conversar em #${channelName}`}
            className="flex-1 bg-transparent text-sm text-discord-text-normal placeholder:text-discord-text-muted focus:outline-none"
          />

          <button type="button" className="text-discord-text-muted hover:text-discord-text-normal">
            <Smile className="h-5 w-5" />
          </button>

          <button type="submit" className="text-discord-text-muted hover:text-discord-brand">
            <SendHorizontal className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
