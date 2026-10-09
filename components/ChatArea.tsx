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
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { createClient } from "@/lib/supabase/client";
import { resolveChatImageUrl } from "@/lib/chatImageUrls";

const STANDARD_EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🙂", "😉", "😊", "😍", "🥰", "😘", "😎", "🤔", "🙃", "😴", "😭", "😡", "🥳", "🤯", "😱", "🤗", "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "✨", "🔥", "🎉", "🎊", "🎂", "🌟", "💀", "👀", "🐱", "🐶", "🌈", "☕", "🍕", "🍿", "🎮", "🚀"];

type ServerEmoji = { id: string; name: string; asset_url: string };

function insertCustomEmojiMarkdown(content: string, emojis: Map<string, ServerEmoji>) {
  return content.replace(/:([a-z0-9_-]{1,32}):/gi, (token, rawName: string) => {
    const emoji = emojis.get(rawName.toLowerCase());
    if (!emoji || !/^https?:\/\//i.test(emoji.asset_url)) return token;
    return `![${rawName}](<${emoji.asset_url}>)`;
  });
}

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
  serverId: string;
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

function formatMessageDate(date: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function ChatArea({
  serverId,
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
  const supabase = createClient();
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [serverEmojis, setServerEmojis] = useState<ServerEmoji[]>([]);
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<Record<string, string>>({});
  const signedAttachmentCache = useRef(new Map<string, string>());
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
  const imageEmojisByName = useMemo(
    () => new Map(serverEmojis.filter((emoji) => /^https?:\/\//i.test(emoji.asset_url)).map((emoji) => [emoji.name.toLowerCase(), emoji])),
    [serverEmojis],
  );

  useEffect(() => {
    let cancelled = false;
    if (!serverId) { setServerEmojis([]); return; }
    void supabase.from("server_assets").select("id,name,asset_url").eq("server_id", serverId).eq("kind", "emoji").order("name").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn("Não foi possível carregar os emojis personalizados:", error.message);
        setServerEmojis([]);
        return;
      }
      setServerEmojis((data ?? []) as ServerEmoji[]);
    });
    return () => { cancelled = true; };
  }, [emojiPickerOpen, serverId, supabase]);

  useEffect(() => {
    let cancelled = false;
    const urls = Array.from(new Set(messages.map((message) => message.attachmentUrl).filter((url): url is string => !!url)));
    const unresolved = urls.filter((url) => !signedAttachmentCache.current.has(url));
    if (!unresolved.length) {
      setSignedAttachmentUrls(Object.fromEntries(urls.map((url) => [url, signedAttachmentCache.current.get(url) ?? url])));
      return;
    }
    void Promise.all(unresolved.map(async (url) => [url, await resolveChatImageUrl(supabase, url)] as const)).then((entries) => {
      if (cancelled) return;
      entries.forEach(([url, signedUrl]) => signedAttachmentCache.current.set(url, signedUrl));
      setSignedAttachmentUrls(Object.fromEntries(urls.map((url) => [url, signedAttachmentCache.current.get(url) ?? url])));
    });
    return () => { cancelled = true; };
  }, [messages, supabase]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!emojiPickerRef.current?.contains(event.target as Node)) setEmojiPickerOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setEmojiPickerOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [emojiPickerOpen]);

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

  const commandPrefix = draft.startsWith("!") ? "!" : draft.startsWith("/") ? "/" : "";
  const showAutocomplete = commandPrefix !== "" && !draft.includes(" ");
  const filteredCommands = useMemo(() => {
    if (!showAutocomplete) return [];
    const query = draft.slice(1).toLowerCase();
    return slashCommands.filter((cmd) => {
      const prefix = cmd.usage?.startsWith("!") ? "!" : "/";
      return prefix === commandPrefix && cmd.name.toLowerCase().startsWith(query);
    });
  }, [commandPrefix, draft, showAutocomplete, slashCommands]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setDraft("");
  }

  function pickCommand(name: string, prefix = "/") {
    setDraft(`${prefix}${name} `);
  }

  function appendEmoji(value: string) {
    setDraft((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${value} `);
    setEmojiPickerOpen(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
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
    <div className="chat-theme-canvas server-view-enter relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-discord-bg-primary">
      <div className="chat-theme-art" aria-hidden="true" />
      {/* Cabeçalho do canal */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] bg-discord-bg-dark/35 px-3 shadow-sm sm:h-12 sm:px-4">
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
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-3 sm:space-y-4 sm:px-4 sm:py-4"
      >
        {loading && !messages.length ? (
          <div role="status" className="server-view-enter space-y-3 py-2">
            <span className="text-xs text-discord-text-muted">Carregando mensagens…</span>
            <div className="max-w-3xl animate-pulse space-y-2"><div className="h-5 w-2/3 rounded bg-white/[0.035]"/><div className="h-5 w-1/2 rounded bg-white/[0.025]"/></div>
          </div>
        ) : !messages.length ? (
          <p className="py-3 text-sm text-discord-text-muted">Ainda não há mensagens neste canal.</p>
        ) : messages.map((message, index) => {
          const timestamp = new Date(message.createdAt);
          const previousTimestamp = index > 0 ? new Date(messages[index - 1].createdAt) : null;
          const showDate = !previousTimestamp || timestamp.toDateString() !== previousTimestamp.toDateString();
          const authorStatus = memberById.get(message.authorId)?.status;
          return (
          <div key={message.id}>
          {showDate && <div className="my-3 flex items-center gap-3 px-2 text-[11px] font-semibold text-discord-text-muted sm:my-5"><span className="h-px flex-1 bg-white/10"/><time dateTime={timestamp.toISOString()}>{formatMessageDate(timestamp)}</time><span className="h-px flex-1 bg-white/10"/></div>}
          <div onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, message }); }} className="group flex gap-2 rounded-xl px-1 py-2 transition-colors hover:bg-white/[0.035] sm:gap-3 sm:px-2">
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
              {authorStatus && <PresenceIndicator presence={authorStatus} avatarBadge borderColor="rgb(var(--d-primary))" cutoutColor="rgb(var(--d-primary))" />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2" onMouseEnter={() => setHoveredAuthorMessageId(message.id)} onMouseLeave={() => setHoveredAuthorMessageId((current) => current === message.id ? null : current)} onFocusCapture={() => setHoveredAuthorMessageId(message.id)} onBlurCapture={() => setHoveredAuthorMessageId((current) => current === message.id ? null : current)}>
                <button type="button" disabled={!memberById.has(message.authorId)} onClick={(event) => openAuthorProfile(message.authorId, event.currentTarget)} className="cursor-pointer rounded-sm text-left font-medium text-discord-header-primary transition-colors hover:text-white hover:underline hover:decoration-white/50 hover:underline-offset-4 disabled:cursor-default disabled:no-underline">{message.authorName}</button>
                <CustomBadgeList badges={memberById.get(message.authorId)?.badges} limit={2} />
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
                const contentWithEmojis = insertCustomEmojiMarkdown(message.content, imageEmojisByName);
                return <div className="prose prose-invert max-w-none text-[15px] leading-6 text-discord-text-normal prose-p:my-0 prose-code:text-discord-text-normal sm:text-sm"><ReactMarkdown components={{ img: ({ src, alt }) => <img src={src ?? ""} alt={alt ?? "emoji personalizado"} loading="lazy" className="mx-0.5 inline-block h-6 w-6 align-[-0.25em] object-contain" /> }}>{contentWithEmojis}</ReactMarkdown></div>;
              })()}

              {message.attachmentUrl && (
                <HoverGifImage
                  src={signedAttachmentUrls[message.attachmentUrl] ?? signedAttachmentCache.current.get(message.attachmentUrl) ?? message.attachmentUrl}
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
      <div className="relative mx-2 mb-2 mt-1 border-t border-white/[0.07] bg-discord-bg-dark/20 pt-2 sm:mx-4 sm:mb-5 sm:mt-2 sm:pt-3">
        {showAutocomplete && filteredCommands.length > 0 && (
          <div className="absolute bottom-[calc(100%+10px)] w-full overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-floating shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[.14em] text-discord-text-muted">{commandPrefix === "!" ? "Comandos" : "Comandos com barra"}</p>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-discord-text-muted">{filteredCommands.length}</span>
            </div>
            {filteredCommands.map((cmd) => {
              const prefix = cmd.usage?.startsWith("!") ? "!" : "/";
              return (
                <button
                  key={cmd.name}
                  onClick={() => pickCommand(cmd.name, prefix)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] font-mono text-xs font-bold text-white">{prefix}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-discord-header-primary">{prefix}{cmd.name}</span>
                    <span className="block truncate text-xs text-discord-text-muted">{cmd.description}</span>
                  </span>
                  {cmd.usage && <span className="hidden shrink-0 font-mono text-[11px] text-discord-text-muted sm:block">{cmd.usage}</span>}
                </button>
              );
            })}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex min-h-12 items-center gap-1.5 rounded-xl bg-discord-bg-secondary px-2 py-1.5 sm:gap-2 sm:rounded-lg sm:px-4 sm:py-2.5"
        >
          <button type="button" onClick={() => imageInput.current?.click()} aria-label="Adicionar anexo" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-discord-text-muted hover:bg-white/5 hover:text-discord-text-normal sm:h-auto sm:w-auto sm:rounded-none">
            <Plus className="h-5 w-5" />
          </button>
          <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />

          <input
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Conversar em #${channelName}`}
            className="min-w-0 flex-1 bg-transparent px-1 text-base text-discord-text-normal placeholder:text-discord-text-muted focus:outline-none sm:text-sm"
          />

          <div ref={emojiPickerRef} className="relative">
            {emojiPickerOpen && <div role="dialog" aria-label="Escolher emoji" className="absolute bottom-[calc(100%+12px)] right-0 z-[90] w-[min(360px,calc(100vw-16px))] rounded-2xl border border-white/10 bg-discord-bg-floating p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-discord-text-muted">Emojis</p><span className="text-[10px] text-discord-text-muted">Clique para inserir</span></div>
              <div className="grid max-h-[min(45dvh,360px)] grid-cols-6 gap-1 overflow-y-auto rounded-xl bg-black/10 p-1 sm:max-h-48 sm:grid-cols-8">
                {STANDARD_EMOJIS.map((emoji, index) => <button key={`${emoji}-${index}`} type="button" onClick={() => appendEmoji(emoji)} aria-label={`Inserir ${emoji}`} className="grid h-10 w-10 place-self-center place-items-center rounded-lg text-2xl transition hover:bg-white/10">{emoji}</button>)}
              </div>
              {serverEmojis.length > 0 && <>
                <p className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-wide text-discord-text-muted">Emojis do servidor</p>
                <div className="grid max-h-[25dvh] grid-cols-6 gap-1 overflow-y-auto rounded-xl bg-black/10 p-1 sm:max-h-32 sm:grid-cols-8">
                  {serverEmojis.map((emoji) => {
                    const isImage = /^https?:\/\//i.test(emoji.asset_url);
                    return <button key={emoji.id} type="button" title={`:${emoji.name}:`} aria-label={`Inserir :${emoji.name}:`} onClick={() => appendEmoji(isImage ? `:${emoji.name}:` : emoji.asset_url)} className="grid h-10 w-10 place-self-center place-items-center rounded-lg text-2xl transition hover:bg-white/10"><span className="max-w-9 truncate">{isImage ? <img src={emoji.asset_url} alt={emoji.name} className="h-7 w-7 object-contain" /> : emoji.asset_url}</span></button>;
                  })}
                </div>
              </>}
            </div>}
            <button type="button" onClick={() => setEmojiPickerOpen((open) => !open)} aria-haspopup="dialog" aria-expanded={emojiPickerOpen} title="Escolher emoji" aria-label="Escolher emoji" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-discord-text-muted transition hover:bg-white/5 hover:text-discord-text-normal sm:h-auto sm:w-auto sm:rounded-none">
              <Smile className="h-5 w-5" />
            </button>
          </div>

          <button type="button" title="Enviar imagem" aria-label="Enviar imagem" onClick={() => imageInput.current?.click()} disabled={uploading} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-discord-text-muted hover:bg-white/5 hover:text-discord-text-normal disabled:opacity-50 sm:h-auto sm:w-auto sm:rounded-none"><ImageIcon className="h-5 w-5" /></button>

          <button type="submit" aria-label="Enviar mensagem" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-discord-brand text-white transition hover:brightness-110 sm:h-auto sm:w-auto sm:bg-transparent sm:text-discord-text-muted sm:hover:bg-transparent sm:hover:text-discord-brand">
            <SendHorizontal className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
