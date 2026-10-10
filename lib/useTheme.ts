"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { complementaryLinkColor } from "@/lib/linkColor";
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY, type ThemeOption } from "@/lib/themes";

const THEME_EVENT = "sekai-theme-change";
const UNLOCK_EVENT = "sekai-theme-unlocks";

let cachedUnlocks: string[] = [];
let unlocksKnown = false;
let refreshPromise: Promise<string[]> | null = null;

export function refreshUnlockedThemes() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = loadUnlockedThemes().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function loadUnlockedThemes() {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      cachedUnlocks = [];
      unlocksKnown = true;
    } else {
      const { data, error } = await supabase.from("user_theme_unlocks").select("theme_id").eq("user_id", userId);
      if (error) return cachedUnlocks;
      cachedUnlocks = (data ?? []).map((row) => String(row.theme_id));
      unlocksKnown = true;
    }
  } catch {
    return cachedUnlocks;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(UNLOCK_EVENT));
  return cachedUnlocks;
}

export function visibleThemes(unlockedIds: readonly string[]): ThemeOption[] {
  const unlocked = new Set(unlockedIds);
  return THEMES.filter((item) => !item.secret || unlocked.has(item.id));
}

function isValidTheme(id: string | null): id is string {
  return !!id && THEMES.some((theme) => theme.id === id);
}

function readStoredTheme(): string {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function toRgb(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
}

function mixWithWhite(color: string, amount: number) {
  return toRgb(color).map((value) => Math.round(value + (255 - value) * amount).toString()).join(" ");
}

function mixColors(foreground: string, background: string, foregroundWeight: number) {
  const front = toRgb(foreground);
  const back = toRgb(background);
  return front.map((value, index) => Math.round(value * foregroundWeight + back[index] * (1 - foregroundWeight)).toString()).join(" ");
}

function applyTheme(id: string) {
  document.documentElement.setAttribute("data-theme", id);
  const selected = THEMES.find((item) => item.id === id);
  const root = document.documentElement;
  if (selected?.overlay) {
    root.setAttribute("data-theme-overlay", selected.overlay);
    root.style.setProperty("--chat-theme-art", `url("/bankai/backgrounds/${selected.overlay}.svg?v=2")`);
  } else {
    root.removeAttribute("data-theme-overlay");
    root.style.removeProperty("--chat-theme-art");
  }
  ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"].forEach((step) => root.style.removeProperty(`--brand-${step}`));
  [
    "--d-brand", "--d-brand-hover", "--surface", "--surface-soft", "--surface-card", "--surface-border",
    "--d-darkest", "--d-dark", "--d-primary", "--d-secondary", "--d-hover", "--d-floating",
    "--bg-gradient-start", "--bg-gradient-end",
    ...Array.from({ length: 7 }, (_, i) => `--g${i + 1}`),
    ...Array.from({ length: 7 }, (_, i) => `--gw${i + 1}`),
  ].forEach((name) => root.style.removeProperty(name));
  if (selected) {
    root.style.setProperty("--sekai-link", complementaryLinkColor(selected.stops));
    const backgroundStops = selected.backgroundStops ?? [selected.stops[0], selected.stops[6]];
    root.style.setProperty("--bg-gradient-start", backgroundStops[0]);
    root.style.setProperty("--bg-gradient-end", backgroundStops[1]);
  } else {
    root.style.removeProperty("--sekai-link");
  }
  if (!selected || ["azul", "roxo", "rosa", "verde", "ambar", "ciano", "rubi", "preto", "menta", "por-do-sol", "oceano", "candy", "grafite"].includes(id)) return;
  const stop = (index: number) => toRgb(selected.stops[index]).join(" ");
  ["50", "100", "200", "300"].forEach((step, index) => root.style.setProperty(`--brand-${step}`, mixWithWhite(selected.stops[0], [0.94, 0.82, 0.62, 0.36][index])));
  [400, 500, 600, 700, 800, 900].forEach((step, index) => root.style.setProperty(`--brand-${step}`, stop([0, 1, 2, 4, 5, 6][index])));
  root.style.setProperty("--d-brand", stop(3));
  root.style.setProperty("--d-brand-hover", stop(4));
  root.style.setProperty("--surface", mixColors(selected.stops[6], "#0f1117", 0.19));
  root.style.setProperty("--surface-soft", mixColors(selected.stops[5], "#181b23", 0.22));
  root.style.setProperty("--surface-card", mixColors(selected.stops[4], "#1d212b", 0.25));
  root.style.setProperty("--surface-border", mixColors(selected.stops[3], "#343946", 0.30));
  root.style.setProperty("--d-darkest", mixColors(selected.stops[6], "#1e1f22", 0.23));
  root.style.setProperty("--d-dark", mixColors(selected.stops[5], "#2b2d31", 0.27));
  root.style.setProperty("--d-primary", mixColors(selected.stops[4], "#313338", 0.28));
  root.style.setProperty("--d-secondary", mixColors(selected.stops[3], "#383a40", 0.32));
  root.style.setProperty("--d-hover", mixColors(selected.stops[3], "#35373c", 0.38));
  root.style.setProperty("--d-floating", mixColors(selected.stops[6], "#111214", 0.20));
  selected.stops.forEach((color, index) => {
    root.style.setProperty(`--g${index + 1}`, color);
    root.style.setProperty(`--gw${index + 1}`, `rgb(${toRgb(color).join(" ")} / 0.48)`);
  });
}

/**
 * Tema visual do Sekai (só muda as cores). A escolha fica salva neste navegador
 * e é sincronizada entre abas e entre os seletores abertos na mesma página.
 */
function themeIsSelectable(id: string) {
  const option = THEMES.find((item) => item.id === id);
  if (!option) return false;
  return !option.secret || cachedUnlocks.includes(id);
}

export function useTheme() {
  const [theme, setThemeState] = useState<string>(DEFAULT_THEME);
  const [unlockedIds, setUnlockedIds] = useState<string[]>(cachedUnlocks);
  const themes = useMemo(() => visibleThemes(unlockedIds), [unlockedIds]);

  useEffect(() => {
    const current = readStoredTheme();
    setThemeState(current);
    applyTheme(current);

    function sync() {
      const next = readStoredTheme();
      setThemeState(next);
      applyTheme(next);
    }

    function syncUnlocks() {
      setUnlockedIds([...cachedUnlocks]);
      if (!unlocksKnown) return;
      const stored = readStoredTheme();
      const option = THEMES.find((item) => item.id === stored);
      if (option?.secret && !cachedUnlocks.includes(stored)) {
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME);
        } catch {
          // O tema padrão vale só até recarregar a página.
        }
        applyTheme(DEFAULT_THEME);
        setThemeState(DEFAULT_THEME);
        window.dispatchEvent(new Event(THEME_EVENT));
      }
    }

    function onStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY) sync();
    }

    void refreshUnlockedThemes();
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener(UNLOCK_EVENT, syncUnlocks);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener(UNLOCK_EVENT, syncUnlocks);
    };
  }, []);

  const setTheme = useCallback((id: string) => {
    if (!themeIsSelectable(id)) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // Sem armazenamento disponível: o tema vale só até recarregar a página.
    }
    applyTheme(id);
    setThemeState(id);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { theme, setTheme, themes, unlockedIds };
}
