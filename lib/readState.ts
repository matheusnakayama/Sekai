function storageKey(userId: string) {
  return `sekai-channel-read:${userId}`;
}

export function loadReadCursors(userId: string) {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const cursors: Record<string, string> = {};
    for (const [channelId, value] of Object.entries(parsed)) {
      if (typeof value === "string" && !Number.isNaN(Date.parse(value))) cursors[channelId] = value;
    }
    return cursors;
  } catch {
    return {};
  }
}

export function saveReadCursors(userId: string, cursors: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(cursors));
  } catch {
    // O aviso continua nesta sessão mesmo se o navegador recusar o armazenamento.
  }
}
