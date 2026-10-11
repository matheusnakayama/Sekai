"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, MoreHorizontal, Pin, Plus, Smile, SendHorizontal, Star, X, Check, FileText, MessageSquarePlus, BarChart3, Sparkles, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HoverGifImage } from "@/components/HoverGifImage";
import { ChatMessageBody } from "@/components/ChatMessageBody";
import { useChatDisplay } from "@/lib/chatPreferences";
import { getProfileCardPosition, UserProfileCard } from "@/components/UserProfileCard";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import type { ProfileCardPosition } from "@/components/UserProfileCard";
import type { MemberItem, ServerRoleOption } from "@/components/MemberList";
import { PrankSimulation } from "@/components/PrankSimulation";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import { createClient } from "@/lib/supabase/client";
import { resolveChatImageUrl } from "@/lib/chatImageUrls";
import { buildMentionNames, contentMentionsUser } from "@/lib/mentions";
import { useDialogs } from "@/components/DialogProvider";
import { MessageContextMenu } from "@/components/MessageContextMenu";
import { forwardedContent, messageLink, QUICK_REACTIONS, quoteDraft, reminderLabel, STANDARD_EMOJIS } from "@/lib/messageMenu";
import { readSaved, rememberReport, toggleSaved, type SavedChatMessage } from "@/lib/savedMessages";
import { ChatTopicCard, ChatTopicThreadDialog } from "@/components/ChatTopic";
import { ChatPollCard } from "@/components/ChatPollCard";
import { beginSpotifyConnect, ensureSpotifyToken, fetchCurrentlyPlaying } from "@/lib/spotify";

type ServerEmoji = { id: string; name: string; asset_url: string };

type MentionSearch = { start: number; end: number; query: string };

function findMentionSearch(value: string, caret: number): MentionSearch | null {
  const beforeCaret = value.slice(0, caret);
  const start = beforeCaret.lastIndexOf("@");
  if (start < 0) return null;
  const previous = beforeCaret[start - 1] ?? "";
  if (previous && !/[\s([{\"'`]/.test(previous)) return null;

  const typed = beforeCaret.slice(start + 1);
  if (!typed || /\s$/.test(typed) || !/^[\p{L}\p{N}_ .-]*$/u.test(typed)) return null;
  const query = typed.trim();
  return query ? { start, end: caret, query } : null;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  systemType?: "member_joined" | "member_left" | "member_kicked" | "member_banned";
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  topicId?: string | null;
  pollId?: string | null;
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
  channelId: string;
  channelName: string;
  messages: ChatMessage[];
  loading?: boolean;
  slashCommands: SlashCommand[];
  onSendMessage: (content: string, attachmentUrl?: string | null, attachment?: { name: string; mimeType: string }) => void;
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
  viewerNames?: string[];
  textChannels?: { id: string; name: string }[];
  onForwardMessage?: (channelId: string, content: string, attachmentUrl?: string | null, attachment?: { name: string; mimeType: string }) => Promise<void>;
  onMarkUnread?: (message: ChatMessage) => void;
  onRemindMessage?: (message: ChatMessage, at: number) => void;
  focusMessageId?: string | null;
  onFocusMessageHandled?: () => void;
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
  channelId,
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
  viewerNames = [],
  textChannels = [],
  onForwardMessage,
  onMarkUnread,
  onRemindMessage,
  focusMessageId = null,
  onFocusMessageHandled,
}: ChatAreaProps) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [draft, setDraft] = useState("");
  const [mentionSearch, setMentionSearch] = useState<MentionSearch | null>(null);
  const [mentionSelection, setMentionSelection] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const composerToolsRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [serverEmojis, setServerEmojis] = useState<ServerEmoji[]>([]);
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<Record<string, string>>({});
  const signedAttachmentCache = useRef(new Map<string, string>());
  const [selectedProfile, setSelectedProfile] = useState<MemberItem | null>(null);
  const [profilePosition, setProfilePosition] = useState<ProfileCardPosition>({ left: 12, top: 12 });
  const [hoveredAuthorMessageId, setHoveredAuthorMessageId] = useState<string | null>(null);
  const [prankOpen, setPrankOpen] = useState(false);
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [topicDraft, setTopicDraft] = useState<{ title: string; content: string } | null>(null);
  const [topicBusy, setTopicBusy] = useState(false);
  const [activeTopic, setActiveTopic] = useState<{ id: string; title: string } | null>(null);
  const [pollDraft, setPollDraft] = useState<{ question: string; options: string[] } | null>(null);
  const [pollBusy, setPollBusy] = useState(false);
  const [composerActionError, setComposerActionError] = useState("");
  const memberById = useMemo(() => new Map<string, MemberItem>(members.map((member) => [member.id, member] as const)), [members]);
  const mentionNames = useMemo(() => buildMentionNames([
    ...viewerNames.map((label) => ({ id: currentUserId ?? undefined, displayName: label })),
    ...members,
  ], currentUserId), [members, currentUserId, viewerNames]);
  const selfMentionNames = useMemo(() => mentionNames.filter((name) => name.mine).map((name) => name.label), [mentionNames]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const previousLastMessageId = useRef<string | null>(null);
  const wasAtBottom = useRef(true);
  const lastMentionNonce = useRef(0);
  const imageEmojisByName = useMemo(
    () => new Map(serverEmojis.filter((emoji) => /^https?:\/\//i.test(emoji.asset_url)).map((emoji) => [emoji.name.toLowerCase(), emoji])),
    [serverEmojis],
  );
  const emojiImages = useMemo(
    () => new Map(Array.from(imageEmojisByName, ([name, emoji]) => [name, emoji.asset_url])),
    [imageEmojisByName],
  );
  const chatDisplay = useChatDisplay(currentUserId);
  const [pins, setPins] = useState<SavedChatMessage[]>([]);
  const [favorites, setFavorites] = useState<SavedChatMessage[]>([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [pinCursor, setPinCursor] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [composerNote, setComposerNote] = useState<string | null>(null);
  const handledFocus = useRef<string | null>(null);
  const quotePrefix = useRef("");
  const pinnedIds = useMemo(() => new Set(pins.map((item) => item.id)), [pins]);
  const favoriteIds = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);

  useEffect(() => {
    if (!composerToolsOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!composerToolsRef.current?.contains(event.target as Node)) {
        setComposerToolsOpen(false);
        setAppsOpen(false);
      }
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setComposerToolsOpen(false); setAppsOpen(false); }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [composerToolsOpen]);

  useEffect(() => {
    if (!currentUserId) {
      setPins([]);
      setFavorites([]);
      return;
    }
    setPins(readSaved(currentUserId, "pins").filter((item) => item.channelId === channelId));
    setFavorites(readSaved(currentUserId, "favorites").filter((item) => item.channelId === channelId));
    setPinCursor(0);
  }, [channelId, currentUserId]);

  useEffect(() => {
    if (!highlightedId) return;
    const timer = window.setTimeout(() => setHighlightedId((current) => current === highlightedId ? null : current), 2600);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  useEffect(() => {
    if (!focusMessageId || loading || handledFocus.current === focusMessageId) return;
    const node = document.getElementById(`message-${focusMessageId}`);
    if (!node) return;
    handledFocus.current = focusMessageId;
    node.scrollIntoView({ block: "center" });
    setHighlightedId(focusMessageId);
    onFocusMessageHandled?.();
  }, [focusMessageId, loading, messages, onFocusMessageHandled]);

  function savedFrom(message: ChatMessage): SavedChatMessage {
    return {
      id: message.id,
      channelId,
      authorName: message.authorName,
      content: message.content,
      createdAt: message.createdAt,
    };
  }

  function refreshSaved(kind: "pins" | "favorites") {
    if (!currentUserId) return;
    const next = readSaved(currentUserId, kind).filter((item) => item.channelId === channelId);
    if (kind === "pins") setPins(next);
    else setFavorites(next);
  }

  function scrollToMessage(messageId: string) {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightedId(messageId);
    setFavoritesOpen(false);
  }

  async function copyText(value: string, emptyMessage: string) {
    const text = value.trim();
    if (!text) {
      await dialogs.notify({ title: "Nada para copiar", message: emptyMessage });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      await dialogs.notify({ title: "Não foi possível copiar", message: "O navegador bloqueou a área de transferência." });
    }
  }

  function speakMessage(message: ChatMessage) {
    const text = message.content.trim() || (message.attachmentUrl ? "Imagem enviada" : "");
    if (!text || typeof window.speechSynthesis === "undefined") {
      void dialogs.notify({ title: "Não foi possível falar", message: "Este navegador não leu a mensagem." });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    window.speechSynthesis.speak(utterance);
  }

  function beginQuote(message: ChatMessage, topic: boolean) {
    const next = quoteDraft(message, topic);
    quotePrefix.current = next;
    setMentionSearch(null);
    setDraft(next);
    setComposerNote(topic ? `Tópico a partir de ${message.authorName}` : `Respondendo ${message.authorName}`);
    window.requestAnimationFrame(() => {
      const node = composerRef.current;
      if (!node) return;
      node.focus();
      const end = node.value.length;
      node.setSelectionRange(end, end);
    });
  }

  function cancelQuote() {
    const prefix = quotePrefix.current;
    quotePrefix.current = "";
    setComposerNote(null);
    setDraft((current) => prefix && current.startsWith(prefix) ? current.slice(prefix.length) : current);
  }

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
    const node = composerRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    if (!mentionRequest || mentionRequest.nonce === lastMentionNonce.current) return;
    lastMentionNonce.current = mentionRequest.nonce;
    const token = `@${mentionRequest.displayName}`;
    setMentionSearch(null);
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

  const mentionSuggestions = useMemo(() => {
    if (!mentionSearch) return [];
    const query = mentionSearch.query.toLocaleLowerCase();
    return [...new Map(members
      .filter((member) => Boolean(member.displayName))
      .map((member) => [member.id, member] as const))]
      .map(([, member]) => ({
        member,
        rank: [member.displayName, member.username].some((value) => value?.toLocaleLowerCase().startsWith(query)) ? 0 : 1,
      }))
      .filter(({ member }) => [member.displayName, member.username].some((value) => value?.toLocaleLowerCase().includes(query)))
      .sort((a, b) => a.rank - b.rank || a.member.displayName.localeCompare(b.member.displayName))
      .slice(0, 8)
      .map(({ member }) => member);
  }, [members, mentionSearch]);

  function refreshMentionSearch(value: string, caret: number) {
    setMentionSearch(findMentionSearch(value, caret));
    setMentionSelection(0);
  }

  function pickMention(member: MemberItem) {
    const node = composerRef.current;
    const search = mentionSearch;
    if (!node || !search) return;
    const mention = `@${member.displayName}`;
    const after = draft.slice(search.end);
    const separator = after && !/^\s/.test(after) ? " " : "";
    const nextDraft = `${draft.slice(0, search.start)}${mention}${separator}${after}`;
    const nextCaret = search.start + mention.length + separator.length;
    setDraft(nextDraft);
    setMentionSearch(null);
    window.requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function submitComposer() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setDraft("");
    setMentionSearch(null);
    setComposerNote(null);
    quotePrefix.current = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitComposer();
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSearch && mentionSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionSelection((index) => (index + 1) % mentionSuggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionSelection((index) => (index - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        pickMention(mentionSuggestions[mentionSelection] ?? mentionSuggestions[0]);
        return;
      }
    }
    if (event.key === "Escape" && mentionSearch) {
      setMentionSearch(null);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitComposer();
    }
  }

  function pickCommand(name: string, prefix = "/") {
    setMentionSearch(null);
    setDraft(`${prefix}${name} `);
  }

  function appendEmoji(value: string) {
    setMentionSearch(null);
    setDraft((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${value} `);
    setEmojiPickerOpen(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function startTopicFromMessage(message: ChatMessage) {
    const initial = message.content.trim();
    setTopicDraft({
      title: initial ? initial.replace(/\s+/g, " ").slice(0, 96) : "Novo tópico",
      content: initial,
    });
    setComposerActionError("");
  }

  async function uploadAttachment(file?: File) {
    if (!file || !onUploadFile) return;
    if (file.size > 10 * 1024 * 1024) { await dialogs.notify({ title: "Arquivo muito grande", message: "O limite para anexos é de 10 MB." }); return; }
    setUploading(true);
    try {
      const url = await onUploadFile(file);
      await onSendMessage("", url, { name: file.name.slice(0, 180) || "arquivo", mimeType: file.type || "application/octet-stream" });
    } catch (error) {
      await dialogs.notify({ title: "Falha ao enviar arquivo", message: error instanceof Error ? error.message : "Não foi possível enviar o arquivo." });
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const image = Array.from(event.clipboardData.items).find((item) => item.kind === "file" && item.type.startsWith("image/"));
    const file = image?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void uploadAttachment(file);
  }

  async function createTopic(event: React.FormEvent) {
    event.preventDefault();
    if (!topicDraft || !currentUserId || topicBusy) return;
    const title = topicDraft.title.trim();
    if (!title) { setComposerActionError("Dê um título ao tópico."); return; }
    setTopicBusy(true);
    setComposerActionError("");
    const { data, error } = await supabase.rpc("create_channel_topic", {
      p_channel_id: channelId,
      p_title: title,
      p_content: topicDraft.content.trim() || null,
    });
    setTopicBusy(false);
    if (error) {
      setComposerActionError(error.message.includes("create_channel_topic") ? "Execute db/chat_composer_features_migration.sql no Supabase para ativar tópicos." : error.message);
      return;
    }
    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.topic_id) { setComposerActionError("O Supabase não confirmou a criação do tópico."); return; }
    setTopicDraft(null);
    setComposerToolsOpen(false);
    setActiveTopic({ id: created.topic_id, title });
  }

  async function createPoll(event: React.FormEvent) {
    event.preventDefault();
    if (!pollDraft || !currentUserId || pollBusy) return;
    const question = pollDraft.question.trim();
    const options = pollDraft.options.map((option) => option.trim()).filter(Boolean);
    if (!question) { setComposerActionError("Escreva a pergunta da enquete."); return; }
    if (options.length < 2) { setComposerActionError("Adicione pelo menos duas opções."); return; }
    setPollBusy(true);
    setComposerActionError("");
    const { error } = await supabase.rpc("create_channel_poll", { p_channel_id: channelId, p_question: question, p_options: options });
    setPollBusy(false);
    if (error) {
      setComposerActionError(error.message.includes("create_channel_poll") ? "Execute db/chat_composer_features_migration.sql no Supabase para ativar enquetes." : error.message);
      return;
    }
    setPollDraft(null);
    setComposerToolsOpen(false);
  }

  async function shareSpotifyTrack() {
    if (!currentUserId) return;
    try {
      const session = await ensureSpotifyToken(currentUserId);
      if (!session) {
        await beginSpotifyConnect();
        return;
      }
      const current = await fetchCurrentlyPlaying(session.accessToken);
      if (!current?.trackUrl) { await dialogs.notify({ title: "Nenhuma música tocando", message: "Abra uma faixa no Spotify e tente compartilhar novamente." }); return; }
      setDraft(`${current.track} — ${current.artist}\n${current.trackUrl}`);
      setAppsOpen(false);
      setComposerToolsOpen(false);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    } catch (error) {
      await dialogs.notify({ title: "Spotify indisponível", message: error instanceof Error ? error.message : "Não foi possível buscar a música atual." });
    }
  }

  return (
    <div className="chat-theme-canvas server-view-enter relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-discord-bg-primary">
      <div className="chat-theme-art" aria-hidden="true" />
      {/* Cabeçalho do canal */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] bg-discord-bg-dark/35 px-3 shadow-sm sm:h-12 sm:px-4">
        <Hash className="h-5 w-5 text-discord-text-muted" />
        <span className="font-semibold text-discord-header-primary">{channelName}</span>
        {favorites.length > 0 && <button type="button" onClick={() => setFavoritesOpen((open) => !open)} aria-expanded={favoritesOpen} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-discord-text-muted hover:bg-white/5 hover:text-white"><Star size={14} className="fill-current text-amber-300" />{favorites.length}</button>}
      </div>
      {favoritesOpen && favorites.length > 0 && <div className="border-b border-white/[0.07] bg-discord-bg-secondary/80 px-3 py-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-discord-text-muted">Favoritos deste canal</p>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {favorites.map((item) => <button key={item.id} type="button" onClick={() => scrollToMessage(item.id)} className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"><span className="shrink-0 text-xs font-semibold text-discord-header-primary">{item.authorName}</span><span className="truncate text-xs text-discord-text-muted">{item.content.trim() || "Imagem"}</span></button>)}
        </div>
      </div>}
      {pins.length > 0 && <div data-pinned-banner className="flex items-center gap-2 border-b border-white/[0.07] bg-discord-bg-secondary/70 px-3 py-2">
        <Pin size={14} className="shrink-0 text-discord-text-muted" />
        <button type="button" onClick={() => { const pin = pins[pinCursor % pins.length]; if (!pin) return; scrollToMessage(pin.id); setPinCursor((current) => current + 1); }} className="min-w-0 flex-1 truncate text-left text-sm text-discord-text-normal">
          <span className="font-semibold">{pins[pinCursor % pins.length]?.authorName}</span>
          <span className="text-discord-text-muted"> {pins[pinCursor % pins.length]?.content.trim() || "Imagem"}</span>
        </button>
        {pins.length > 1 && <span className="shrink-0 text-[11px] text-discord-text-muted">{(pinCursor % pins.length) + 1}/{pins.length}</span>}
      </div>}

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
          const systemCopy = message.systemType === "member_joined"
            ? "entrou no servidor. Dê boas-vindas!"
            : message.systemType === "member_left"
              ? "saiu do servidor."
              : message.systemType === "member_kicked"
                ? "foi expulso do servidor."
                : "foi banido do servidor.";
          return (
          <div key={message.id} id={`message-${message.id}`}>
          {showDate && <div className="my-3 flex items-center gap-3 px-2 text-[11px] font-semibold text-discord-text-muted sm:my-5"><span className="h-px flex-1 bg-white/10"/><time dateTime={timestamp.toISOString()}>{formatMessageDate(timestamp)}</time><span className="h-px flex-1 bg-white/10"/></div>}
          {message.systemType ? (
            <div className="my-1 flex items-center gap-2 rounded-xl border border-discord-brand/20 bg-discord-brand/[0.06] px-3 py-2 text-sm text-discord-text-normal">
              <span aria-hidden="true" className="text-base">{message.systemType === "member_joined" ? "👋" : message.systemType === "member_left" ? "↗" : message.systemType === "member_kicked" ? "⤴" : "⛔"}</span>
              <p className="min-w-0 flex-1"><strong className="font-semibold text-discord-header-primary">{message.authorName}</strong> {systemCopy}</p>
              <time dateTime={timestamp.toISOString()} className="shrink-0 text-[11px] text-discord-text-muted">{formatTime(message.createdAt)}</time>
            </div>
          ) : (
          <div onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, message });
          }} className={`group relative flex rounded-xl px-1 py-2 transition-colors hover:bg-white/[0.035] ${chatDisplay.showAvatars ? "gap-2 sm:gap-3" : ""} sm:px-2 ${highlightedId === message.id ? "ring-2 ring-discord-brand/70" : ""} ${message.authorId !== currentUserId && contentMentionsUser(message.content, selfMentionNames) ? "mention-message" : ""}`}>
            {editing?.id !== message.id && <div className="pointer-events-none absolute right-2 top-1 z-10 hidden items-center gap-0.5 rounded-lg border border-white/10 bg-[#111214] p-0.5 shadow-lg group-hover:pointer-events-auto group-hover:flex">
              {QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" aria-label={`Reagir com ${emoji}`} onClick={() => onToggleReaction?.(message.id, emoji)} className="grid h-7 w-7 place-items-center rounded-md text-base hover:bg-white/10">{emoji}</button>)}
              <button type="button" aria-label="Mais ações da mensagem" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.left, y: rect.bottom + 6, message }); }} className="grid h-7 w-7 place-items-center rounded-md text-discord-text-muted hover:bg-white/10 hover:text-white"><MoreHorizontal size={16} /></button>
            </div>}
            {chatDisplay.showAvatars && <button type="button" disabled={!memberById.has(message.authorId)} onClick={(event) => openAuthorProfile(message.authorId, event.currentTarget)} aria-label={`Abrir perfil de ${message.authorName}`} className="relative mt-0.5 h-10 w-10 shrink-0 cursor-pointer overflow-visible rounded-full bg-discord-brand transition-transform hover:scale-[1.04] disabled:cursor-default disabled:hover:scale-100">
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
            </button>}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2" onMouseEnter={() => setHoveredAuthorMessageId(message.id)} onMouseLeave={() => setHoveredAuthorMessageId((current) => current === message.id ? null : current)} onFocusCapture={() => setHoveredAuthorMessageId(message.id)} onBlurCapture={() => setHoveredAuthorMessageId((current) => current === message.id ? null : current)}>
                <button type="button" disabled={!memberById.has(message.authorId)} onClick={(event) => openAuthorProfile(message.authorId, event.currentTarget)} className="cursor-pointer rounded-sm text-left font-medium text-discord-header-primary transition-colors hover:text-white hover:underline hover:decoration-white/50 hover:underline-offset-4 disabled:cursor-default disabled:no-underline">{message.authorName}</button>
                <CustomBadgeList badges={memberById.get(message.authorId)?.badges} limit={2} />
                <span className="text-xs text-discord-text-muted">{formatTime(message.createdAt)}</span>
                {pinnedIds.has(message.id) && <Pin size={12} className="text-discord-text-muted" aria-label="Mensagem fixada" />}
                {favoriteIds.has(message.id) && <Star size={12} className="fill-current text-amber-300" aria-label="Mensagem favorita" />}
              </div>

              {editing?.id === message.id ? <div className="mt-1 flex gap-2"><input autoFocus value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} className="min-w-0 flex-1 rounded-lg bg-discord-bg-dark px-3 py-2 text-sm text-discord-text-normal outline-none ring-1 ring-brand-500"/><button title="Salvar" onClick={async () => { await onEditMessage?.(message.id, editing.content); setEditing(null); }} className="rounded-lg bg-discord-brand p-2 text-white"><Check size={16}/></button><button title="Cancelar" onClick={() => setEditing(null)} className="rounded-lg bg-discord-bg-secondary p-2"><X size={16}/></button></div> : (() => {
                if (message.topicId) return <ChatTopicCard topicId={message.topicId} title={message.content || "Novo tópico"} currentUserId={currentUserId}/>;
                if (message.pollId) return <ChatPollCard pollId={message.pollId} fallbackQuestion={message.content || "Enquete"} currentUserId={currentUserId}/>;
                const prank = message.content.match(/^\[sekai-troll:([^\]]+)\]$/);
                if (prank) return currentUserId === prank[1] ? (
                  <div className="mt-2 flex max-w-md items-center justify-between gap-4 rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 p-4">
                    <div><p className="text-sm font-semibold text-discord-header-primary">Uma brincadeira chegou 🎉</p><p className="mt-1 text-xs text-discord-text-muted">É só uma animação. Nada será instalado ou alterado no seu dispositivo.</p></div>
                    <button type="button" onClick={() => setPrankOpen(true)} className="shrink-0 rounded-lg bg-theme-gradient px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110">Abrir</button>
                  </div>
                ) : <p className="mt-1 text-xs italic text-discord-text-muted">Um convite para a brincadeira foi enviado a um membro.</p>;
                return <ChatMessageBody content={message.content} preferences={chatDisplay} emojiImages={emojiImages} mentionNames={mentionNames} />;
              })()}

              {chatDisplay.showUploads && message.attachmentUrl && (message.attachmentMimeType?.startsWith("image/") || (!message.attachmentMimeType && !message.attachmentName)) && (
                <HoverGifImage
                  src={signedAttachmentUrls[message.attachmentUrl] ?? signedAttachmentCache.current.get(message.attachmentUrl) ?? message.attachmentUrl}
                  alt={message.attachmentName || "Imagem enviada"}
                  className="mt-2 max-h-80 rounded-lg border border-black/20"
                />
              )}
              {chatDisplay.showUploads && message.attachmentUrl && message.attachmentMimeType && !message.attachmentMimeType.startsWith("image/") && (
                <a href={signedAttachmentUrls[message.attachmentUrl] ?? signedAttachmentCache.current.get(message.attachmentUrl) ?? message.attachmentUrl} download={message.attachmentName || true} target="_blank" rel="noreferrer" className="mt-2 flex w-fit max-w-full items-center gap-3 rounded-xl border border-white/10 bg-discord-bg-secondary/80 px-3 py-2.5 text-discord-text-normal transition hover:bg-white/10">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-discord-brand/15 text-discord-brand"><FileText size={18}/></span><span className="min-w-0"><span className="block max-w-[min(60vw,320px)] truncate text-sm font-medium">{message.attachmentName || "Arquivo anexado"}</span><span className="block text-[10px] text-discord-text-muted">{message.attachmentMimeType}</span></span>
                </a>
              )}

              {chatDisplay.showReactions && message.reactions && message.reactions.length > 0 && (
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
          )}
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

      {menu && <MessageContextMenu
        x={menu.x}
        y={menu.y}
        canEdit={menu.message.authorId === currentUserId && !menu.message.id.startsWith("pending:")}
        canDelete={(menu.message.authorId === currentUserId || canManageMessages) && !menu.message.id.startsWith("pending:")}
        pinned={pinnedIds.has(menu.message.id)}
        favorited={favoriteIds.has(menu.message.id)}
        channels={textChannels}
        onClose={() => setMenu(null)}
        onReact={(emoji) => onToggleReaction?.(menu.message.id, emoji)}
        onReply={() => beginQuote(menu.message, false)}
        onTopic={() => startTopicFromMessage(menu.message)}
        onForward={(targetChannelId) => {
          const message = menu.message;
          const channel = textChannels.find((item) => item.id === targetChannelId);
          void (async () => {
            try {
              await onForwardMessage?.(
                targetChannelId,
                forwardedContent(message),
                message.attachmentUrl,
                message.attachmentName && message.attachmentMimeType
                  ? { name: message.attachmentName, mimeType: message.attachmentMimeType }
                  : undefined,
              );
              if (targetChannelId !== channelId) await dialogs.notify({ title: "Mensagem encaminhada", message: `Ela foi enviada para #${channel?.name ?? "canal"}.` });
            } catch (error) {
              await dialogs.notify({ title: "Não foi possível encaminhar", message: error instanceof Error ? error.message : "Tente de novo." });
            }
          })();
        }}
        onCopyText={() => { void copyText(menu.message.content || menu.message.attachmentUrl || "", "Essa mensagem não tem texto."); }}
        onTogglePin={() => { if (!currentUserId) return; toggleSaved(currentUserId, "pins", savedFrom(menu.message)); refreshSaved("pins"); }}
        onToggleFavorite={() => { if (!currentUserId) return; toggleSaved(currentUserId, "favorites", savedFrom(menu.message)); refreshSaved("favorites"); }}
        onRemind={(at) => {
          onRemindMessage?.(menu.message, at);
          void dialogs.notify({ title: "Lembrete criado", message: `${reminderLabel(at)} você vê de novo: ${menu.message.content.trim() || "esta mensagem"}.` });
        }}
        onMarkUnread={() => onMarkUnread?.(menu.message)}
        onCopyLink={() => { void copyText(messageLink(window.location.origin, channelId, menu.message.id), "Não foi possível montar o link."); }}
        onSpeak={() => speakMessage(menu.message)}
        onEdit={() => setEditing({ id: menu.message.id, content: menu.message.content })}
        onDelete={() => {
          const message = menu.message;
          void (async () => {
            const confirmed = await dialogs.confirm({ title: "Excluir mensagem", message: "Essa mensagem sai do canal para todo mundo.", confirmLabel: "Excluir mensagem", danger: true });
            if (!confirmed) return;
            try { await onDeleteMessage?.(message.id); }
            catch (error) { await dialogs.notify({ title: "Não foi possível excluir", message: error instanceof Error ? error.message : "Tente de novo." }); }
          })();
        }}
        onReport={() => {
          const message = menu.message;
          void (async () => {
            const confirmed = await dialogs.confirm({ title: "Denunciar mensagem", message: "A denúncia fica salva neste navegador. O autor não é avisado.", confirmLabel: "Denunciar mensagem", danger: true });
            if (!confirmed || !currentUserId) return;
            const fresh = rememberReport(currentUserId, savedFrom(message));
            await dialogs.notify({ title: fresh ? "Denúncia registrada" : "Denúncia já registrada", message: "Ela ficou salva só neste aparelho." });
          })();
        }}
      />}

      {/* Campo de mensagem */}
      <div className="relative mx-2 mb-2 mt-1 border-t border-white/[0.07] bg-discord-bg-dark/20 pt-2 sm:mx-4 sm:mb-5 sm:mt-2 sm:pt-3">
        {mentionSearch && mentionSuggestions.length > 0 && (
          <div className="absolute bottom-[calc(100%+10px)] z-30 w-full overflow-hidden rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 shadow-2xl">
            <p className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-discord-text-muted">Membros correspondentes</p>
            {mentionSuggestions.map((member, index) => (
              <button
                key={member.id}
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => pickMention(member)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition", index === mentionSelection ? "bg-white/[0.09]" : "hover:bg-white/[0.05]")}
              >
                {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-discord-brand/20 text-xs font-bold text-discord-brand">{member.displayName.slice(0, 1).toLocaleUpperCase()}</span>}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-discord-header-primary">{member.displayName}</span>
                {member.username && <span className="max-w-[40%] truncate text-xs text-discord-text-muted">{member.username}</span>}
              </button>
            ))}
          </div>
        )}

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

        {composerNote && <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-discord-text-muted"><span className="min-w-0 flex-1 truncate">{composerNote}</span><button type="button" aria-label="Cancelar resposta" onClick={cancelQuote} className="rounded p-1 hover:bg-white/10 hover:text-white"><X size={14}/></button></div>}

        <form
          onSubmit={handleSubmit}
          className="flex min-h-12 items-center gap-1.5 rounded-xl bg-discord-bg-secondary px-2 py-1.5 sm:gap-2 sm:rounded-lg sm:px-4 sm:py-2.5"
        >
          <div ref={composerToolsRef} className="relative shrink-0">
            <button type="button" onClick={() => { setComposerToolsOpen((open) => !open); setAppsOpen(false); }} aria-label="Abrir opções do chat" aria-haspopup="menu" aria-expanded={composerToolsOpen} className="grid h-9 w-9 place-items-center rounded-full text-discord-text-muted transition hover:bg-white/10 hover:text-discord-header-primary">
              <Plus className="h-5 w-5" />
            </button>
            {composerToolsOpen && <div role="menu" aria-label="Opções do chat" className="absolute bottom-[calc(100%+12px)] left-0 z-[100] w-[min(300px,calc(100vw-28px))] overflow-hidden rounded-xl border border-white/10 bg-discord-bg-floating p-1.5 shadow-2xl">
              {appsOpen ? <>
                <button type="button" role="menuitem" onClick={() => setAppsOpen(false)} className="mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-discord-text-muted hover:bg-white/5 hover:text-white"><span aria-hidden="true">←</span> Todos os apps</button>
                <div className="border-t border-white/[0.08] pt-1">
                  <button type="button" role="menuitem" onClick={() => { setEmojiPickerOpen(true); setAppsOpen(false); setComposerToolsOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-white/[0.06]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-discord-brand/15 text-discord-brand"><Smile size={17}/></span><span><span className="block text-sm font-medium text-discord-header-primary">Emojis do servidor</span><span className="block text-[11px] text-discord-text-muted">Emojis personalizados disponíveis</span></span></button>
                  <button type="button" role="menuitem" onClick={() => { setComposerToolsOpen(false); setAppsOpen(false); onSendMessage("!bankai"); }} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-white/[0.06]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-fuchsia-400/15 text-fuchsia-200"><Sparkles size={17}/></span><span><span className="block text-sm font-medium text-discord-header-primary">Bankai</span><span className="block text-[11px] text-discord-text-muted">Ative o sorteio de Bankai</span></span></button>
                  <button type="button" role="menuitem" onClick={() => void shareSpotifyTrack()} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-white/[0.06]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1DB954]/15 text-[#1DB954]"><Music2 size={17}/></span><span><span className="block text-sm font-medium text-discord-header-primary">Compartilhar Spotify</span><span className="block text-[11px] text-discord-text-muted">Inserir a faixa que está tocando</span></span></button>
                </div>
              </> : <>
                <button type="button" role="menuitem" disabled={uploading || !onUploadFile} onClick={() => { attachmentInput.current?.click(); setComposerToolsOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition hover:bg-white/[0.06] disabled:opacity-40"><FileText size={17} className="text-discord-text-muted"/><span className="text-sm text-discord-text-normal">Enviar um arquivo</span></button>
                <button type="button" role="menuitem" onClick={() => { setTopicDraft({ title: "", content: "" }); setComposerActionError(""); setComposerToolsOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition hover:bg-white/[0.06]"><MessageSquarePlus size={17} className="text-discord-text-muted"/><span className="text-sm text-discord-text-normal">Criar tópico</span></button>
                <button type="button" role="menuitem" onClick={() => { setPollDraft({ question: "", options: ["", ""] }); setComposerActionError(""); setComposerToolsOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition hover:bg-white/[0.06]"><BarChart3 size={17} className="text-discord-text-muted"/><span className="text-sm text-discord-text-normal">Criar enquete</span></button>
                <button type="button" role="menuitem" onClick={() => setAppsOpen(true)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition hover:bg-white/[0.06]"><Sparkles size={17} className="text-discord-text-muted"/><span className="text-sm text-discord-text-normal">Use apps</span><span className="ml-auto text-xs text-discord-text-muted">›</span></button>
              </>}
            </div>}
          </div>
          <input ref={attachmentInput} type="file" accept="*/*" className="hidden" onChange={(event) => { void uploadAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} />

          <textarea
            ref={composerRef}
            rows={1}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); refreshMentionSearch(e.target.value, e.target.selectionStart); }}
            onKeyDown={onComposerKeyDown}
            onKeyUp={(e) => { if (!["Escape", "ArrowDown", "ArrowUp", "Enter"].includes(e.key)) refreshMentionSearch(e.currentTarget.value, e.currentTarget.selectionStart); }}
            onClick={(e) => refreshMentionSearch(e.currentTarget.value, e.currentTarget.selectionStart)}
            onPaste={handlePaste}
            onBlur={() => setMentionSearch(null)}
            placeholder={`Conversar em #${channelName}`}
            className="max-h-40 min-h-6 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-base text-discord-text-normal placeholder:text-discord-text-muted focus:outline-none sm:text-sm"
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

          <button type="submit" aria-label="Enviar mensagem" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-discord-brand text-white transition hover:brightness-110 sm:h-auto sm:w-auto sm:bg-transparent sm:text-discord-text-muted sm:hover:bg-transparent sm:hover:text-discord-brand">
            <SendHorizontal className="h-5 w-5" />
          </button>
        </form>
      </div>
      {topicDraft && <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !topicBusy) setTopicDraft(null); }}>
        <form role="dialog" aria-modal="true" aria-label="Criar tópico" onSubmit={(event) => void createTopic(event)} className="w-full max-w-lg rounded-2xl border border-white/10 bg-discord-bg-floating p-4 shadow-2xl sm:p-5">
          <div className="mb-4 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-discord-brand/15 text-discord-brand"><MessageSquarePlus size={19}/></span><div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-discord-header-primary">Criar tópico</h2><p className="mt-1 text-xs text-discord-text-muted">Abra uma conversa paralela em #{channelName}.</p></div><button type="button" disabled={topicBusy} onClick={() => setTopicDraft(null)} aria-label="Fechar" className="rounded-lg p-2 text-discord-text-muted hover:bg-white/10 hover:text-white"><X size={17}/></button></div>
          <label className="mb-3 block"><span className="mb-1.5 block text-xs font-semibold text-discord-text-normal">Nome do tópico</span><input autoFocus maxLength={100} value={topicDraft.title} onChange={(event) => setTopicDraft({ ...topicDraft, title: event.target.value })} placeholder="Ex.: Planejar a próxima partida" className="w-full rounded-xl border border-white/10 bg-discord-bg-secondary px-3 py-2.5 text-base text-discord-text-normal outline-none focus:border-discord-brand sm:text-sm"/></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-discord-text-normal">Mensagem inicial <span className="font-normal text-discord-text-muted">(opcional)</span></span><textarea maxLength={4000} rows={3} value={topicDraft.content} onChange={(event) => setTopicDraft({ ...topicDraft, content: event.target.value })} placeholder="Dê contexto para a conversa…" className="w-full resize-y rounded-xl border border-white/10 bg-discord-bg-secondary px-3 py-2.5 text-base text-discord-text-normal outline-none focus:border-discord-brand sm:text-sm"/></label>
          {composerActionError && <p role="alert" className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{composerActionError}</p>}
          <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={topicBusy} onClick={() => setTopicDraft(null)} className="rounded-lg px-3 py-2 text-sm text-discord-text-muted hover:bg-white/5">Cancelar</button><button type="submit" disabled={topicBusy || !topicDraft.title.trim()} className="rounded-lg bg-discord-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{topicBusy ? "Criando…" : "Criar tópico"}</button></div>
        </form>
      </div>}
      {pollDraft && <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !pollBusy) setPollDraft(null); }}>
        <form role="dialog" aria-modal="true" aria-label="Criar enquete" onSubmit={(event) => void createPoll(event)} className="w-full max-w-lg rounded-2xl border border-white/10 bg-discord-bg-floating p-4 shadow-2xl sm:p-5">
          <div className="mb-4 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-discord-brand/15 text-discord-brand"><BarChart3 size={19}/></span><div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-discord-header-primary">Criar enquete</h2><p className="mt-1 text-xs text-discord-text-muted">Os membros do canal podem escolher uma opção.</p></div><button type="button" disabled={pollBusy} onClick={() => setPollDraft(null)} aria-label="Fechar" className="rounded-lg p-2 text-discord-text-muted hover:bg-white/10 hover:text-white"><X size={17}/></button></div>
          <label className="mb-4 block"><span className="mb-1.5 block text-xs font-semibold text-discord-text-normal">Pergunta</span><input autoFocus maxLength={200} value={pollDraft.question} onChange={(event) => setPollDraft({ ...pollDraft, question: event.target.value })} placeholder="O que você quer perguntar?" className="w-full rounded-xl border border-white/10 bg-discord-bg-secondary px-3 py-2.5 text-base text-discord-text-normal outline-none focus:border-discord-brand sm:text-sm"/></label>
          <div className="space-y-2"><span className="block text-xs font-semibold text-discord-text-normal">Opções</span>{pollDraft.options.map((option, index) => <div key={index} className="flex items-center gap-2"><input maxLength={100} value={option} onChange={(event) => setPollDraft({ ...pollDraft, options: pollDraft.options.map((current, itemIndex) => itemIndex === index ? event.target.value : current) })} placeholder={`Opção ${index + 1}`} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-discord-bg-secondary px-3 py-2.5 text-base text-discord-text-normal outline-none focus:border-discord-brand sm:text-sm"/>{pollDraft.options.length > 2 && <button type="button" onClick={() => setPollDraft({ ...pollDraft, options: pollDraft.options.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remover opção ${index + 1}`} className="rounded-lg p-2 text-discord-text-muted hover:bg-white/10 hover:text-white"><X size={15}/></button>}</div>)}
            {pollDraft.options.length < 10 && <button type="button" onClick={() => setPollDraft({ ...pollDraft, options: [...pollDraft.options, ""] })} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-discord-brand hover:bg-discord-brand/10">+ Adicionar opção</button>}
          </div>
          {composerActionError && <p role="alert" className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{composerActionError}</p>}
          <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={pollBusy} onClick={() => setPollDraft(null)} className="rounded-lg px-3 py-2 text-sm text-discord-text-muted hover:bg-white/5">Cancelar</button><button type="submit" disabled={pollBusy || !pollDraft.question.trim() || pollDraft.options.filter((item) => item.trim()).length < 2} className="rounded-lg bg-discord-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{pollBusy ? "Publicando…" : "Publicar enquete"}</button></div>
        </form>
      </div>}
      {activeTopic && <ChatTopicThreadDialog topicId={activeTopic.id} initialTitle={activeTopic.title} currentUserId={currentUserId} onClose={() => setActiveTopic(null)}/>}
    </div>
  );
}
