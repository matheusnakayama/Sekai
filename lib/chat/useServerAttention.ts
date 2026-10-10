"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { laterTimestamp, summarizeAttention, type AttentionMessage, type ChannelAttention } from "@/lib/attention";
import { contentMentionsUser } from "@/lib/mentions";
import { loadReadCursors, saveReadCursors } from "@/lib/readState";

export type MentionNotice = {
  serverId: string;
  channelId: string;
  preview: string;
  createdAt: string;
};

type TextChannel = { id: string; serverId: string };

function previewText(content: string) {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > 90 ? `${clean.slice(0, 87)}…` : clean;
}

async function mapPool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await run(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export function useServerAttention({
  userId,
  selfNames,
  activeTextChannelId,
  refreshKey,
  onMention,
}: {
  userId: string | null;
  selfNames: string[];
  activeTextChannelId: string;
  refreshKey: string;
  onMention?: (notice: MentionNotice) => void;
}) {
  const [byChannel, setByChannel] = useState<Record<string, ChannelAttention>>({});
  const stateRef = useRef({
    userId: userId ?? "",
    channels: [] as TextChannel[],
    fetched: [] as AttentionMessage[],
    live: [] as AttentionMessage[],
    cursors: {} as Record<string, string>,
    selfNames,
    activeChannelId: activeTextChannelId,
  });
  const onMentionRef = useRef(onMention);
  const seenRef = useRef(new Set<string>());
  stateRef.current.userId = userId ?? "";
  stateRef.current.selfNames = selfNames;
  stateRef.current.activeChannelId = activeTextChannelId;
  onMentionRef.current = onMention;

  const publish = useCallback(() => {
    const state = stateRef.current;
    if (!state.userId) {
      setByChannel({});
      return;
    }
    const visibleChannel = typeof document !== "undefined" && document.visibilityState === "visible"
      ? state.activeChannelId
      : "";
    setByChannel(summarizeAttention({
      channels: state.channels,
      messages: [...state.fetched, ...state.live],
      cursors: state.cursors,
      userId: state.userId,
      selfNames: state.selfNames,
      activeChannelId: visibleChannel,
    }));
  }, []);

  const markRead = useCallback((channelId: string, at?: string) => {
    const state = stateRef.current;
    if (!state.userId || !channelId) return;
    const stamp = laterTimestamp(new Date().toISOString(), at);
    const current = state.cursors[channelId];
    if (!current || Date.parse(stamp) > Date.parse(current)) {
      state.cursors = { ...state.cursors, [channelId]: stamp };
      saveReadCursors(state.userId, state.cursors);
    }
    publish();
  }, [publish]);

  useEffect(() => {
    if (activeTextChannelId && document.visibilityState === "visible") markRead(activeTextChannelId);
    else publish();
  }, [activeTextChannelId, markRead, publish]);

  useEffect(() => {
    publish();
  }, [selfNames.join("\n"), publish]);

  useEffect(() => {
    if (!userId) {
      stateRef.current.channels = [];
      stateRef.current.fetched = [];
      stateRef.current.live = [];
      setByChannel({});
      return;
    }

    const accountId = userId;
    let cancelled = false;
    const supabase = createClient();
    let realtime: ReturnType<typeof supabase.channel> | null = null;

    async function loadMessages(channels: TextChannel[], cursors: Record<string, string>) {
      const batches = await mapPool(channels, 6, async (channel) => {
        const cursor = cursors[channel.id];
        if (!cursor) return [] as AttentionMessage[];
        const { data, error } = await supabase
          .from("messages")
          .select("id, channel_id, author_id, content, created_at")
          .eq("channel_id", channel.id)
          .gt("created_at", cursor)
          .neq("author_id", accountId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error || !data) return [] as AttentionMessage[];
        return data.map((row) => ({
          id: String(row.id),
          channelId: String(row.channel_id),
          authorId: String(row.author_id),
          content: String(row.content ?? ""),
          createdAt: String(row.created_at),
        }));
      });
      return batches.flat();
    }

    let generation = 0;

    function subscribe(channels: TextChannel[]) {
      if (realtime) void supabase.removeChannel(realtime);
      realtime = null;
      if (!channels.length) return;
      const channel = supabase.channel(`sekai-attention:${accountId}:${generation}`);
      channels.forEach((textChannel) => {
        channel.on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${textChannel.id}`,
        }, (event) => {
          const row = event.new as { id?: string; author_id?: string; content?: string | null; created_at?: string };
          if (!row.id || !row.author_id || row.author_id === accountId) return;
          if (seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);
          const message: AttentionMessage = {
            id: row.id,
            channelId: textChannel.id,
            authorId: row.author_id,
            content: row.content ?? "",
            createdAt: row.created_at || new Date().toISOString(),
          };
          const state = stateRef.current;
          state.live = [...state.live.filter((item) => item.id !== message.id), message].slice(-200);
          const viewing = document.visibilityState === "visible" && state.activeChannelId === textChannel.id;
          if (viewing) {
            markRead(textChannel.id, message.createdAt);
            return;
          }
          publish();
          if (contentMentionsUser(message.content, state.selfNames)) {
            onMentionRef.current?.({
              serverId: textChannel.serverId,
              channelId: textChannel.id,
              preview: previewText(message.content),
              createdAt: message.createdAt,
            });
          }
        });
      });
      realtime = channel;
      channel.subscribe();
    }

    async function reload() {
      const current = ++generation;
      const { data: memberships, error: membershipError } = await supabase
        .from("members")
        .select("server_id")
        .eq("user_id", accountId);
      if (cancelled || current !== generation) return;
      if (membershipError) {
        console.warn("Não foi possível verificar menções nos servidores:", membershipError.message);
        return;
      }
      const serverIds = [...new Set((memberships ?? []).map((row) => row.server_id).filter(Boolean))] as string[];
      if (!serverIds.length) {
        stateRef.current.channels = [];
        stateRef.current.fetched = [];
        publish();
        subscribe([]);
        return;
      }

      const channelRows: { id: string; server_id: string }[] = [];
      for (let index = 0; index < serverIds.length; index += 80) {
        const { data, error } = await supabase
          .from("channels")
          .select("id, server_id")
          .in("server_id", serverIds.slice(index, index + 80))
          .eq("type", "text");
        if (cancelled || current !== generation) return;
        if (error) {
          console.warn("Não foi possível ouvir mensagens novas:", error.message);
          return;
        }
        channelRows.push(...(data ?? []));
      }

      const channels = channelRows.map((row) => ({ id: row.id, serverId: row.server_id }));
      const cursors = loadReadCursors(accountId);
      let stamped = false;
      const firstSeen = new Date(Date.now() + 5000).toISOString();
      for (const channel of channels) {
        if (!cursors[channel.id]) {
          cursors[channel.id] = firstSeen;
          stamped = true;
        }
      }
      if (stamped) saveReadCursors(accountId, cursors);
      if (cancelled || current !== generation) return;
      stateRef.current.channels = channels;
      stateRef.current.cursors = cursors;
      const fetched = await loadMessages(channels, cursors);
      if (cancelled || current !== generation) return;
      const activeId = document.visibilityState === "visible" ? stateRef.current.activeChannelId : "";
      if (activeId) {
        const newest = fetched
          .filter((message) => message.channelId === activeId)
          .reduce((stamp, message) => laterTimestamp(stamp, message.createdAt), new Date().toISOString());
        const previous = cursors[activeId];
        if (!previous || Date.parse(newest) > Date.parse(previous)) {
          cursors[activeId] = newest;
          saveReadCursors(accountId, cursors);
          stateRef.current.cursors = cursors;
        }
      }
      const fetchedIds = new Set(fetched.map((message) => message.id));
      stateRef.current.fetched = fetched;
      stateRef.current.live = stateRef.current.live.filter((message) => !fetchedIds.has(message.id));
      publish();
      subscribe(channels);
    }

    void reload();

    function onVisible() {
      if (document.visibilityState !== "visible") {
        publish();
        return;
      }
      if (stateRef.current.activeChannelId) markRead(stateRef.current.activeChannelId);
      void reload();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (realtime) void supabase.removeChannel(realtime);
    };
  }, [markRead, publish, refreshKey, userId]);

  return byChannel;
}
