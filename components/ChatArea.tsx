"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Plus, Smile, SendHorizontal, Pencil, Trash2, X, Check, Image as ImageIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { HoverGifImage } from "@/components/HoverGifImage";
import { getProfileCardPosition, UserProfileCard } from "@/components/UserProfileCard";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import type { ProfileCardPosition } from "@/components/UserProfileCard";
import type { MemberItem, ServerRoleOption } from "@/components/MemberList";
import { PrankSimulation } from "@/components/PrankSimulation";

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
  loading?: boolean;
  slashCommands: SlashCommand[];
  onSendMessage: (content: string, attachmentUrl?: string | null) => void;
  onUploadFile?: (file: File) => Promise<string>;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  canManageMessages?: boolean;
  members?: MemberItem[];
  onAddFriend?: (userId: string) => void;
  onMessageMember?: (member: MemberItem) => void;
  onQuickMessageMember?: (member: MemberItem, content: string) => Promise<void>;
  mentionRequest?: { displayName: string; nonce: number } | null;
  onMentionHandled?: (nonce: number) => void;
  canKickMembers?: boolean;
  onKickMember?: (member: MemberItem) => void;
  roles?: ServerRoleOption[];
  canManageRoles?: boolean;
  canManageSelfRoles?: boolean;
  onToggleMemberRole?: (member: MemberItem, role: ServerRoleOption, assigned: boolean) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ChatArea({
  channelName,
  messages,
  loading = false,
  slashCommands,
  onSendMessage,
  onUploadFile,
  onToggleReaction,
  currentUserId,
  onEditMessage,
  onDeleteMessage,
  canManageMessages = false,
  members = [],
  onAddFriend,
  onMessageMember,
  onQuickMessageMember,
  mentionRequest,
  onMentionHandled,
  canKickMembers = false,
  onKickMember,
  roles = [],
  canManageRoles = false,
  canManageSelfRoles = false,
  onToggleMemberRole,
}: ChatAreaProps) {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<MemberItem | null>(null);
  const [profilePosition, setProfilePosition] = useState<ProfileCardPosition>({ left: 12, top: 12 });
  const [hoveredAuthorMessageId, setHoveredAuthorMessageId] = useState<string | null>(null);
  const [prankOpen, setPrankOpen] = useState(false);
  const memberById = useMemo(() => new Map<string, MemberItem>(members.map((member) => [member.id, member] as const)), [members]);
  const composerRef = useRef<HTMLInputElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const previousLastMessageId = useRef<string | null>(null);
  const wasAtBottom = useRef(true);
  const lastMentionNonce = useRef(0);

  useEffect(() => {
    setSelectedProfile((current) => current ? memberById.get(current.id) ?? null : null);
  }, [memberById]);

  useEffect(() => {
    if (!mentionRequest || mentionRequest.nonce === lastMentionNonce.current) return;
    lastMentionNonce.current = mentionRequest.nonce;
    const token = `@${mentionRequest.displayName}`;
    setDraft((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${token} `);
    window.requestAnimationFrame(() => composerRef.current?.focus());
    onMentionHandled?.(mentionRequest.nonce);
  }, [mentionRequest, onMentionHandled]);

  useEffect(() => {
    if (loading) return;
    const container = messagesScrollRef.current;
    if (!container) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      previousLastMessageId.current = null;
      return;
    }

    const firstHistoryRender = previousLastMessageId.current === null;
    const newMessageArrived = previousLastMessageId.current !== lastMessage.id;
    if (firstHistoryRender) {
      container.scrollTop = container.scrollHeight;
      wasAtBottom.current = true;
    } else if (newMessageArrived && (wasAtBottom.current || lastMessage.authorId === currentUserId)) {
      const behavior = document.documentElement.dataset.reducedMotion === "true" ? "auto" : "smooth";
      container.scrollTo({ top: container.scrollHeight, behavior });
      wasAtBottom.current = true;
    }
    previousLastMessageId.current = lastMessage.id;
  }, [messages, loading, currentUserId]);

  function openAuthorProfile(authorId: string, trigger: HTMLButtonElement) {
    const member = memberById.get(authorId);
    if (!member) return;
    setProfilePosition(getProfileCardPosition(trigger, true));
    setSelectedProfile(member);
  }

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

  async function uploadImage(file?: File) {
    if (!file || !file.type.startsWith("image/") || !onUploadFile) return;
    if (file.size > 5 * 1024 * 1024) { window.alert("A imagem deve ter até 5 MB."); return; }
    setUploading(true);
    try {
      const url = await onUploadFile(file);
      onSendMessage("", url);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="server-view-enter flex h-full flex-1 flex-col bg-discord-bg-primary">
      {/* Cabeçalho do canal */}
      <div className="flex h-12 items-center gap-2 border-b border-white/[0.07] bg-discord-bg-dark/35 px-4 shadow-sm">
        <Hash className="h-5 w-5 text-discord-text-muted" />
        <span className="font-semibold text-discord-header-primary">{channelName}</span>
      </div>

      {/* Feed de mensagens */}
      <div
        ref={messagesScrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          wasAtBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {loading && !messages.length ? (
          <div role="status" className="server-view-enter space-y-3 py-2">
            <span className="text-xs text-discord-text-muted">Carregando mensagens…</span>
            <div className="max-w-3xl animate-pulse space-y-2"><div className="h-5 w-2/3 rounded bg-white/[0.035]"/><div className="h-5 w-1/2 rounded bg-white/[0.025]"/></div>
          </div>
        ) : !messages.length ? (
          <p className="py-3 text-sm text-discord-text-muted">Ainda não há mensagens neste canal.</p>
        ) : messages.map((message) => {
          const authorStatus = memberById.get(message.authorId)?.status;
          const statusClass = authorStatus === "online" ? "status-online" : authorStatus === "idle" ? "status-idle" : authorStatus === "dnd" ? "status-dnd" : "status-offline";
          return (
          <div key={message.id} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, message }); }} className="group flex gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.035]">
            <button type="button" disabled={!memberById.has(message.authorId)} onClick={(event) => openAuthorProfile(message.authorId, event.currentTarget)} aria-label={`Abrir perfil de ${message.authorName}`} className="relative mt-0.5 h-10 w-10 shrink-0 cursor-pointer overflow-visible rounded-full bg-discord-brand transition-transform hover:scale-[1.04] disabled:cursor-default disabled:hover:scale-100">
              <span className="relative block h-full w-full overflow-hidden rounded-full">
                {message.authorAvatarUrl ? (
                  <CroppedProfileImage
                    src={message.authorAvatarUrl}
                    alt=""
                    className="rounded-full"
                    isHovered={hoveredAuthorMessageId === message.id}
                    positionX={memberById.get(message.authorId)?.avatarPositionX}
                    positionY={memberById.get(message.authorId)?.avatarPositionY}
                    zoom={memberById.get(message.authorId)?.avatarZoom}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                    {message.authorName[0]?.toUpperCase()}
                  </span>
                )}
              </span>
              {authorStatus && <span aria-label={`Status: ${authorStatus}`} className={cn("status-dot !h-3.5 !w-3.5 !border-[3px] !border-discord-bg-primary", statusClass)} style={{ bottom: -2, right: -2 }} />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2" onMouseEnter={() => setHoveredAuthorMessageId(message.id)} onMouseLeave={() => setHoveredAuthorMessageId((current) => current === message.id ? null : current)} onFocusCapture={() => setHoveredAuthorMessageId(message.id)} onBlurCapture={() => setHoveredAuthorMessageId((current) => current === message.id ? null : current)}>
                <button type="button" disabled={!memberById.has(message.authorId)} onClick={(event) => openAuthorProfile(message.authorId, event.currentTarget)} className="cursor-pointer rounded-sm text-left font-medium text-discord-header-primary transition-colors hover:text-white hover:underline hover:decoration-white/50 hover:underline-offset-4 disabled:cursor-default disabled:no-underline">{message.authorName}</button>
                <span className="text-xs text-discord-text-muted">{formatTime(message.createdAt)}</span>
              </div>

              {editing?.id === message.id ? <div className="mt-1 flex gap-2"><input autoFocus value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} className="min-w-0 flex-1 rounded-lg bg-discord-bg-dark px-3 py-2 text-sm text-discord-text-normal outline-none ring-1 ring-brand-500"/><button title="Salvar" onClick={async () => { await onEditMessage?.(message.id, editing.content); setEditing(null); }} className="rounded-lg bg-discord-brand p-2 text-white"><Check size={16}/></button><button title="Cancelar" onClick={() => setEditing(null)} className="rounded-lg bg-discord-bg-secondary p-2"><X size={16}/></button></div> : (() => {
                const prank = message.content.match(/^\[sekai-troll:([^\]]+)\]$/);
                if (prank) return currentUserId === prank[1] ? (
                  <div className="mt-2 flex max-w-md items-center justify-between gap-4 rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 p-4">
                    <div><p className="text-sm font-semibold text-discord-header-primary">Uma brincadeira chegou 🎉</p><p className="mt-1 text-xs text-discord-text-muted">É só uma animação. Nada será instalado ou alterado no seu dispositivo.</p></div>
                    <button type="button" onClick={() => setPrankOpen(true)} className="shrink-0 rounded-lg bg-theme-gradient px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110">Abrir</button>
                  </div>
                ) : <p className="mt-1 text-xs italic text-discord-text-muted">Um convite para a brincadeira foi enviado a um membro.</p>;
                return <div className="prose prose-invert max-w-none text-sm text-discord-text-normal prose-p:my-0 prose-code:text-discord-text-normal"><ReactMarkdown>{message.content}</ReactMarkdown></div>;
              })()}

              {message.attachmentUrl && (
                <HoverGifImage
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
          );
        })}
      </div>

      {selectedProfile && <UserProfileCard
        profile={selectedProfile}
        position={profilePosition}
        currentUserId={currentUserId ?? ""}
        onClose={() => setSelectedProfile(null)}
        onMessage={onMessageMember ? () => onMessageMember(selectedProfile) : undefined}
        onQuickMessage={onQuickMessageMember ? (content) => onQuickMessageMember(selectedProfile, content) : undefined}
        onAddFriend={onAddFriend ? () => onAddFriend(selectedProfile.id) : undefined}
        onKick={canKickMembers && onKickMember ? () => onKickMember(selectedProfile) : undefined}
        roles={roles}
        canManageRoles={canManageRoles && (selectedProfile.id !== currentUserId || canManageSelfRoles)}
        assignedRoleIds={selectedProfile.roleIds ?? []}
        onToggleRole={onToggleMemberRole ? (role, assigned) => onToggleMemberRole(selectedProfile, role, assigned) : undefined}
      />}

      {prankOpen && <PrankSimulation onClose={() => setPrankOpen(false)} />}

      {menu && <><button aria-label="Fechar menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenu(null)} /><div style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 130) }} className="fixed z-50 w-52 rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 shadow-2xl backdrop-blur-xl">
        {menu.message.authorId === currentUserId && <button onClick={() => { setEditing({ id: menu.message.id, content: menu.message.content }); setMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-discord-text-normal hover:bg-white/10"><Pencil size={15}/>Editar mensagem</button>}
        {(menu.message.authorId === currentUserId || canManageMessages) && <button onClick={async () => { if (window.confirm("Excluir esta mensagem?")) await onDeleteMessage?.(menu.message.id); setMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"><Trash2 size={15}/>Excluir mensagem</button>}
      </div></>}

      {/* Campo de mensagem */}
      <div className="relative mx-4 mb-5 mt-2 border-t border-white/[0.07] bg-discord-bg-dark/20 pt-3">
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
          <button type="button" onClick={() => imageInput.current?.click()} className="text-discord-text-muted hover:text-discord-text-normal">
            <Plus className="h-5 w-5" />
          </button>
          <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />

          <input
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Conversar em #${channelName}`}
            className="flex-1 bg-transparent text-sm text-discord-text-normal placeholder:text-discord-text-muted focus:outline-none"
          />

          <button type="button" className="text-discord-text-muted hover:text-discord-text-normal">
            <Smile className="h-5 w-5" />
          </button>

          <button type="button" title="Enviar imagem" onClick={() => imageInput.current?.click()} disabled={uploading} className="text-discord-text-muted hover:text-discord-text-normal disabled:opacity-50"><ImageIcon className="h-5 w-5" /></button>

          <button type="submit" className="text-discord-text-muted hover:text-discord-brand">
            <SendHorizontal className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
