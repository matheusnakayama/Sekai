"use client";

import { useEffect, useState, useCallback } from "react";
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
export function useChannelMessages(channelId: string, currentUserId: string) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

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
    if (!channelId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data: rows } = await supabase
        .from("messages")
        .select("id, channel_id, author_id, content, attachment_url, created_at, profiles(display_name, username, avatar_url)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(100);

      const { data: reactionRows } = await supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji")
        .in("message_id", (rows ?? []).map((r) => r.id));

      if (cancelled) return;

      const mapped = (rows ?? []).map((r) => mapRow(r as unknown as RawMessageRow));
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

      setMessages(mapped);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [channelId, currentUserId, supabase, mapRow]);

  // Assina eventos em tempo real (WebSocket) para o canal atual
  useEffect(() => {
    if (!channelId) return;

    const channel = supabase
      .channel(`room:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        async (payload) => {
          const row = payload.new as RawMessageRow;
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, username, avatar_url")
            .eq("id", row.author_id)
            .single();
          setMessages((prev) => [...prev, mapRow({ ...row, profiles: profile ?? undefined })]);
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
      supabase.removeChannel(channel);
    };
  }, [channelId, currentUserId, supabase, mapRow]);

  const sendMessage = useCallback(
    async (content: string) => {
      // A policy "messages_insert_own" garante author_id = auth.uid(),
      // send_messages = true e que o usuário não está mutado.
      const { error } = await supabase.from("messages").insert({
        channel_id: channelId,
        author_id: currentUserId,
        content,
      });
      if (error) console.error("Erro ao enviar mensagem:", error.message);
    },
    [channelId, currentUserId, supabase]
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

  return { messages, loading, sendMessage, toggleReaction, editMessage, deleteMessage };
}
