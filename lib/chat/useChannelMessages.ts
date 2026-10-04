"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/components/ChatArea";

interface RawMessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  attachment_url: string | null;
  created_at: string;
  profiles?: { display_name: string | null; username: string; avatar_url: string | null };
}

/**
 * Hook responsável por:
 * 1) Buscar o histórico de mensagens do canal
 * 2) Escutar novas mensagens/reações via WebSocket (Supabase Realtime)
 * 3) Expor sendMessage() e toggleReaction(), que respeitam o RLS do banco
 */
export function useChannelMessages(
  channelId: string,
  currentUserId: string,
  currentUserName = "Você",
  currentUserAvatarUrl: string | null = null,
) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedChannelId, setLoadedChannelId] = useState("");
  const activeChannelIdRef = useRef(channelId);
  activeChannelIdRef.current = channelId;

  const mapRow = useCallback(
    (row: RawMessageRow): ChatMessage => ({
      id: row.id,
      authorId: row.author_id,
      authorName: row.profiles?.display_name || row.profiles?.username || "Usuário",
      authorAvatarUrl: row.profiles?.avatar_url,
      content: row.content,
      attachmentUrl: row.attachment_url,
      createdAt: row.created_at,
      reactions: [],
    }),
    []
  );

  // Carrega histórico + agrega reações
  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      setLoading(false);
      setLoadedChannelId("");
      return;
    }
    let cancelled = false;
    setMessages([]);
    setLoading(true);
    setLoadedChannelId("");

    async function load() {
      setLoading(true);

      const { data: rows } = await supabase
        .from("messages")
        .select("id, channel_id, author_id, content, attachment_url, created_at, profiles(display_name, username, avatar_url)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(100);
      // Busca as mais recentes para respeitar o limite e exibe em ordem cronológica.
      const chronologicalRows = [...(rows ?? [])].reverse();

      const { data: reactionRows } = await supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji")
        .in("message_id", chronologicalRows.map((r) => r.id));

      if (cancelled) return;

      const mapped = chronologicalRows.map((r) => mapRow(r as unknown as RawMessageRow));
      for (const msg of mapped) {
        const forThisMessage = (reactionRows ?? []).filter((rr) => rr.message_id === msg.id);
        const grouped = new Map<string, { count: number; reactedByMe: boolean }>();
        for (const rr of forThisMessage) {
          const entry = grouped.get(rr.emoji) ?? { count: 0, reactedByMe: false };
          entry.count += 1;
          if (rr.user_id === currentUserId) entry.reactedByMe = true;
          grouped.set(rr.emoji, entry);
        }
        msg.reactions = Array.from(grouped.entries()).map(([emoji, v]) => ({ emoji, ...v }));
      }

      setMessages((previous) => {
        const loadedIds = new Set(mapped.map((message) => message.id));
        const arrivedWhileLoading = previous.filter((message) => !loadedIds.has(message.id));
        return [...mapped, ...arrivedWhileLoading].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      });
      setLoading(false);
      setLoadedChannelId(channelId);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [channelId, currentUserId, supabase, mapRow]);

  // Assina eventos em tempo real (WebSocket) para o canal atual
  useEffect(() => {
    if (!channelId) return;
    let active = true;

    const channel = supabase
      .channel(`room:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        async (payload) => {
          const row = payload.new as RawMessageRow;
          const ownProfile = row.author_id === currentUserId
            ? { display_name: currentUserName, username: currentUserName, avatar_url: currentUserAvatarUrl }
            : null;
          if (!active || activeChannelIdRef.current !== channelId) return;

          // Insira primeiro para o Realtime não esperar outra ida ao banco só
          // para resolver o nome/avatar. O perfil de outras pessoas é
          // preenchido em segundo plano quando a consulta terminar.
          const incoming = mapRow({ ...row, profiles: ownProfile ?? undefined });
          setMessages((previous) => {
            if (previous.some((message) => message.id === incoming.id)) return previous;
            if (incoming.authorId === currentUserId) {
              const pendingIndex = previous.findIndex((message) =>
                message.id.startsWith("pending:") &&
                message.authorId === incoming.authorId &&
                message.content === incoming.content &&
                message.attachmentUrl === incoming.attachmentUrl
              );
              if (pendingIndex >= 0) {
                const next = [...previous];
                next[pendingIndex] = incoming;
                return next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
              }
            }
            return [...previous, incoming].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          });
          if (!ownProfile) {
            void supabase
              .from("profiles")
              .select("display_name, username, avatar_url")
              .eq("id", row.author_id)
              .maybeSingle()
              .then(({ data: profile }) => {
                if (!active || activeChannelIdRef.current !== channelId || !profile) return;
                setMessages((previous) => previous.map((message) => message.id === row.id ? {
                  ...message,
                  authorName: profile.display_name || profile.username || message.authorName,
                  authorAvatarUrl: profile.avatar_url,
                } : message));
              });
          }
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const row = payload.new as RawMessageRow;
        setMessages((prev) => prev.map((message) => message.id === row.id ? { ...message, content: row.content, attachmentUrl: row.attachment_url } : message));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const old = payload.old as { id?: string };
        if (old.id) setMessages((prev) => prev.filter((message) => message.id !== old.id));
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.new as { message_id: string; user_id: string; emoji: string };
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== r.message_id) return m;
              const reactions = [...(m.reactions ?? [])];
              const existing = reactions.find((x) => x.emoji === r.emoji);
              if (existing) {
                existing.count += 1;
                if (r.user_id === currentUserId) existing.reactedByMe = true;
              } else {
                reactions.push({ emoji: r.emoji, count: 1, reactedByMe: r.user_id === currentUserId });
              }
              return { ...m, reactions };
            })
          );
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [channelId, currentUserId, currentUserName, currentUserAvatarUrl, supabase, mapRow]);

  const sendMessage = useCallback(
    async (content: string, attachmentUrl?: string | null) => {
      // A policy "messages_insert_own" garante author_id = auth.uid(),
      // send_messages = true e que o usuário não está mutado.
      const pendingId = `pending:${crypto.randomUUID()}`;
      const optimistic: ChatMessage = {
        id: pendingId,
        authorId: currentUserId,
        authorName: currentUserName,
        authorAvatarUrl: currentUserAvatarUrl,
        content,
        attachmentUrl: attachmentUrl ?? null,
        createdAt: new Date().toISOString(),
        reactions: [],
      };
      if (activeChannelIdRef.current === channelId) {
        setMessages((previous) => [...previous, optimistic]);
      }

      try {
        const { data, error } = await supabase.from("messages").insert({
          channel_id: channelId,
          author_id: currentUserId,
          content,
          attachment_url: attachmentUrl ?? null,
        }).select("id, channel_id, author_id, content, attachment_url, created_at").single();
        if (error) throw error;
        if (!data) throw new Error("O servidor não confirmou o envio da mensagem.");
        if (activeChannelIdRef.current !== channelId) return;

        const confirmed: ChatMessage = { ...optimistic, id: data.id, createdAt: data.created_at };
        setMessages((previous) => {
          if (previous.some((message) => message.id === data.id)) {
            return previous.filter((message) => message.id !== pendingId);
          }
          return previous.map((message) => message.id === pendingId ? confirmed : message)
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        });
      } catch (error) {
        if (activeChannelIdRef.current === channelId) {
          setMessages((previous) => previous.filter((message) => message.id !== pendingId));
        }
        throw error;
      }
    },
    [channelId, currentUserId, currentUserName, currentUserAvatarUrl, supabase]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const message = messages.find((m) => m.id === messageId);
      const already = message?.reactions?.find((r) => r.emoji === emoji)?.reactedByMe;

      if (already) {
        await supabase
          .from("message_reactions")
          .delete()
          .match({ message_id: messageId, user_id: currentUserId, emoji });
      } else {
        await supabase.from("message_reactions").insert({
          message_id: messageId,
          user_id: currentUserId,
          emoji,
        });
      }
    },
    [messages, currentUserId, supabase]
  );

  const editMessage = useCallback(async (messageId: string, content: string) => {
    const { error } = await supabase.from("messages").update({ content }).eq("id", messageId).eq("author_id", currentUserId);
    if (error) throw error;
    setMessages((prev) => prev.map((message) => message.id === messageId ? { ...message, content } : message));
  }, [currentUserId, supabase]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) throw error;
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
  }, [supabase]);

  return {
    messages: channelId && loadedChannelId === channelId
      ? messages
      : messages.filter((message) => message.id.startsWith("pending:")),
    loading: loading || (!!channelId && loadedChannelId !== channelId),
    sendMessage,
    toggleReaction,
    editMessage,
    deleteMessage,
  };
}
