"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from "@/lib/themes";

const THEME_EVENT = "sekai-theme-change";

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

function applyTheme(id: string) {
  document.documentElement.setAttribute("data-theme", id);
}

/**
 * Tema visual do Sekai (só muda as cores). A escolha fica salva neste navegador
 * e é sincronizada entre abas e entre os seletores abertos na mesma página.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<string>(DEFAULT_THEME);

  useEffect(() => {
    const current = readStoredTheme();
    setThemeState(current);
    applyTheme(current);

    function sync() {
      const next = readStoredTheme();
      setThemeState(next);
      applyTheme(next);
    }

    function onStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY) sync();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  const setTheme = useCallback((id: string) => {
    if (!isValidTheme(id)) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // Sem armazenamento disponível: o tema vale só até recarregar a página.
    }
    applyTheme(id);
    setThemeState(id);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { theme, setTheme };
}
