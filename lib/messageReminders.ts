"use client";

import { useEffect, useRef } from "react";

export type StoredReminder = {
  id: string;
  channelId: string;
  channelName: string;
  authorName: string;
  content: string;
  at: number;
};

function storageKey(userId: string) {
  return `sekai-reminders:${userId}`;
}

export function loadReminders(userId: string): StoredReminder[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredReminder => {
      if (!item || typeof item !== "object") return false;
      const row = item as StoredReminder;
      return typeof row.id === "string" && typeof row.at === "number" && typeof row.channelId === "string";
    });
  } catch {
    return [];
  }
}

function saveReminders(userId: string, reminders: StoredReminder[]) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(reminders));
  } catch {
    // O lembrete ainda dispara nesta sessão pelo evento.
  }
}

export function reminderBody(reminder: StoredReminder) {
  const text = reminder.content.replace(/\s+/g, " ").trim() || "Mensagem";
  const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return `${reminder.authorName} em #${reminder.channelName}: ${preview}`;
}

export function queueReminder(userId: string, reminder: StoredReminder) {
  if (!userId) return;
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
  const next = [...loadReminders(userId).filter((item) => item.id !== reminder.id), reminder];
  saveReminders(userId, next);
  window.dispatchEvent(new CustomEvent<StoredReminder>("sekai-reminder", { detail: reminder }));
}

export function useMessageReminders(userId: string | null, onFire: (reminder: StoredReminder) => void) {
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  useEffect(() => {
    if (!userId) return;
    const timers = new Set<number>();

    function consume(reminder: StoredReminder) {
      const left = loadReminders(userId!).filter((item) => item.id !== reminder.id);
      saveReminders(userId!, left);
      onFireRef.current(reminder);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("Lembrete do Sekai", { body: reminderBody(reminder), icon: "/sekai-symbol.jpg" });
        } catch {
          // O aviso na página já cobre o lembrete.
        }
      }
    }

    function arm(reminder: StoredReminder) {
      const delay = Math.min(Math.max(0, reminder.at - Date.now()), 2_147_000_000);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        consume(reminder);
      }, delay);
      timers.add(timer);
    }

    loadReminders(userId).forEach(arm);

    function onAdd(event: Event) {
      const reminder = (event as CustomEvent<StoredReminder>).detail;
      if (reminder?.id) arm(reminder);
    }
    window.addEventListener("sekai-reminder", onAdd);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("sekai-reminder", onAdd);
    };
  }, [userId]);
}
