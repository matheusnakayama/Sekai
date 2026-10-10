export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "💯"] as const;

export const STANDARD_EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🙂", "😉", "😊", "😍", "🥰", "😘", "😎", "🤔", "🙃", "😴", "😭", "😡", "🥳", "🤯", "😱", "🤗", "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "✨", "🔥", "🎉", "🎊", "🎂", "🌟", "💀", "👀", "🐱", "🐶", "🌈", "☕", "🍕", "🍿", "🎮", "🚀"];

export type MenuMessage = {
  authorName: string;
  content: string;
  attachmentUrl?: string | null;
};

function oneLine(message: MenuMessage) {
  const raw = message.content.replace(/\s+/g, " ").trim() || (message.attachmentUrl ? "Imagem" : "Mensagem");
  return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
}

export function quoteDraft(message: MenuMessage, topic = false) {
  const quote = `> **${message.authorName}:** ${oneLine(message)}`;
  return topic ? `${quote}\n\n**Tópico:** ` : `${quote}\n\n`;
}

export function forwardedContent(message: MenuMessage) {
  const text = message.content.trim();
  return text ? `**Encaminhado de ${message.authorName}:**\n${text}` : `**Encaminhado de ${message.authorName}:**`;
}

export function messageLink(origin: string, channelId: string, messageId: string) {
  const url = new URL("/", origin);
  url.searchParams.set("channel", channelId);
  url.searchParams.set("message", messageId);
  return url.toString();
}

export function reminderMoment(kind: "15m" | "1h" | "3h" | "tomorrow", now = Date.now()) {
  if (kind === "15m") return now + 15 * 60 * 1000;
  if (kind === "1h") return now + 60 * 60 * 1000;
  if (kind === "3h") return now + 3 * 60 * 60 * 1000;
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.getTime();
}

export function reminderLabel(at: number, now = Date.now()) {
  const minutes = Math.round((at - now) / 60000);
  if (minutes < 90) return `Daqui a ${Math.max(1, minutes)} min`;
  if (minutes < 60 * 20) return `Daqui a ${Math.round(minutes / 60)} h`;
  return "Amanhã às 9h";
}
