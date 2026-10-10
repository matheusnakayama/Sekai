export type SavedChatMessage = {
  id: string;
  channelId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

type SavedKind = "pins" | "favorites" | "reports";

function storageKey(userId: string, kind: SavedKind) {
  return `sekai-${kind}:${userId}`;
}

export function readSaved(userId: string, kind: SavedKind): SavedChatMessage[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId, kind)) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedChatMessage => {
      if (!item || typeof item !== "object") return false;
      const row = item as SavedChatMessage;
      return typeof row.id === "string" && typeof row.channelId === "string";
    });
  } catch {
    return [];
  }
}

function writeSaved(userId: string, kind: SavedKind, items: SavedChatMessage[]) {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(storageKey(userId, kind), JSON.stringify(items));
  } catch {
    // O estado em memória continua valendo nesta sessão.
  }
}

export function toggleSaved(userId: string, kind: "pins" | "favorites", message: SavedChatMessage) {
  const current = readSaved(userId, kind);
  const exists = current.some((item) => item.id === message.id);
  writeSaved(userId, kind, exists ? current.filter((item) => item.id !== message.id) : [...current, message]);
  return !exists;
}

export function rememberReport(userId: string, message: SavedChatMessage) {
  const current = readSaved(userId, "reports");
  if (current.some((item) => item.id === message.id)) return false;
  writeSaved(userId, "reports", [...current, message].slice(-100));
  return true;
}
