import { contentMentionsUser } from "./mentions";

export type AttentionMessage = {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
};

export type ChannelAttention = {
  serverId: string;
  unread: boolean;
  mentions: number;
};

export function laterTimestamp(current: string, next?: string) {
  if (!next) return current;
  const left = Date.parse(current);
  const right = Date.parse(next);
  if (Number.isNaN(left)) return next;
  if (Number.isNaN(right)) return current;
  return right > left ? next : current;
}

export function isAfter(createdAt: string, cursor: string | undefined) {
  if (!cursor) return true;
  const created = Date.parse(createdAt);
  const read = Date.parse(cursor);
  if (Number.isNaN(created) || Number.isNaN(read)) return createdAt > cursor;
  return created > read;
}

export function summarizeAttention(input: {
  channels: { id: string; serverId: string }[];
  messages: AttentionMessage[];
  cursors: Record<string, string>;
  userId: string;
  selfNames: string[];
  activeChannelId?: string;
}) {
  const result: Record<string, ChannelAttention> = {};
  for (const channel of input.channels) {
    result[channel.id] = { serverId: channel.serverId, unread: false, mentions: 0 };
  }
  const seen = new Set<string>();
  for (const message of input.messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    const slot = result[message.channelId];
    if (!slot) continue;
    if (message.authorId === input.userId) continue;
    if (input.activeChannelId && message.channelId === input.activeChannelId) continue;
    if (!isAfter(message.createdAt, input.cursors[message.channelId])) continue;
    slot.unread = true;
    if (contentMentionsUser(message.content, input.selfNames)) slot.mentions += 1;
  }
  return result;
}

export function attentionForServer(byChannel: Record<string, ChannelAttention>, serverId: string) {
  let hasUnread = false;
  let mentionCount = 0;
  for (const slot of Object.values(byChannel)) {
    if (slot.serverId !== serverId) continue;
    if (slot.unread) hasUnread = true;
    mentionCount += slot.mentions;
  }
  return { hasUnread, mentionCount };
}
