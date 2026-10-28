"use client";

import { useEffect, useState } from "react";

export type CallUserMix = {
  /** 0 a 2. 1 é 100% e 2 é 200%. */
  volume: number;
  muted: boolean;
  videoHidden: boolean;
  note: string;
  nickname: string;
};

export const CALL_USER_MIX_EVENT = "sekai-call-user-mix";
const STORAGE_KEY = "sekai-call-user-mix";

export const DEFAULT_CALL_USER_MIX: CallUserMix = {
  volume: 1,
  muted: false,
  videoHidden: false,
  note: "",
  nickname: "",
};

function clampVolume(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(2, Math.round(number * 100) / 100));
}

function readAll(): Record<string, CallUserMix> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, CallUserMix>;
  } catch {
    return {};
  }
}

export function readCallUserMix(userId: string): CallUserMix {
  const stored = readAll()[userId];
  if (!stored || typeof stored !== "object") return { ...DEFAULT_CALL_USER_MIX };
  return {
    volume: clampVolume(stored.volume),
    muted: stored.muted === true,
    videoHidden: stored.videoHidden === true,
    note: typeof stored.note === "string" ? stored.note.slice(0, 200) : "",
    nickname: typeof stored.nickname === "string" ? stored.nickname.slice(0, 32) : "",
  };
}

export function writeCallUserMix(userId: string, patch: Partial<CallUserMix>) {
  const next = { ...readCallUserMix(userId), ...patch, volume: clampVolume(patch.volume ?? readCallUserMix(userId).volume) };
  if (typeof patch.note === "string") next.note = patch.note.slice(0, 200);
  if (typeof patch.nickname === "string") next.nickname = patch.nickname.slice(0, 32);
  if (typeof window === "undefined") return next;
  try {
    const all = readAll();
    all[userId] = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(CALL_USER_MIX_EVENT, { detail: { userId } }));
  } catch {
    // O volume vale nesta sessão mesmo se o navegador recusar o armazenamento.
  }
  return next;
}

export function useCallUserMix(userId: string) {
  const [mix, setMix] = useState<CallUserMix>(DEFAULT_CALL_USER_MIX);
  useEffect(() => {
    const load = () => setMix(readCallUserMix(userId));
    load();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) load();
    };
    window.addEventListener(CALL_USER_MIX_EVENT, onChange);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(CALL_USER_MIX_EVENT, onChange);
      window.removeEventListener("storage", load);
    };
  }, [userId]);
  return mix;
}
