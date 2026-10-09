"use client";

import { useEffect, useState } from "react";

export type SpoilerDisplay = "click" | "always";

export type ChatDisplayPreferences = {
  embedLinkMedia: boolean;
  showUploads: boolean;
  showLinkPreviews: boolean;
  showReactions: boolean;
  spoilerDisplay: SpoilerDisplay;
  showAvatars: boolean;
  composerPreview: boolean;
};

export const DEFAULT_CHAT_DISPLAY: ChatDisplayPreferences = {
  embedLinkMedia: true,
  showUploads: true,
  showLinkPreviews: true,
  showReactions: true,
  spoilerDisplay: "click",
  showAvatars: true,
  composerPreview: true,
};

export const CHAT_PREFERENCES_EVENT = "sekai-chat-preferences";

export function readChatDisplay(userId?: string | null): ChatDisplayPreferences {
  if (!userId || typeof window === "undefined") return DEFAULT_CHAT_DISPLAY;
  try {
    const saved = JSON.parse(localStorage.getItem(`sekai-preferences:${userId}`) || "null");
    const chat = saved?.chat ?? {};
    const compact = saved?.density === "compact";
    return {
      embedLinkMedia: chat.embedLinkMedia !== false,
      showUploads: chat.showUploads !== false,
      showLinkPreviews: chat.showLinkPreviews !== false,
      showReactions: chat.showReactions !== false,
      spoilerDisplay: chat.spoilerDisplay === "always" ? "always" : "click",
      showAvatars: !compact && chat.showAvatars !== false,
      composerPreview: chat.composerPreview !== false,
    };
  } catch {
    return DEFAULT_CHAT_DISPLAY;
  }
}

export function useChatDisplay(userId?: string | null) {
  const [preferences, setPreferences] = useState<ChatDisplayPreferences>(DEFAULT_CHAT_DISPLAY);
  useEffect(() => {
    const load = () => setPreferences(readChatDisplay(userId));
    load();
    window.addEventListener(CHAT_PREFERENCES_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(CHAT_PREFERENCES_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [userId]);
  return preferences;
}
