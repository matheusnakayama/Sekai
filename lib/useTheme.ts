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

function toRgb(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
}

function mixWithWhite(color: string, amount: number) {
  return toRgb(color).map((value) => Math.round(value + (255 - value) * amount).toString()).join(" ");
}

function applyTheme(id: string) {
  document.documentElement.setAttribute("data-theme", id);
  const selected = THEMES.find((item) => item.id === id);
  const root = document.documentElement;
  ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"].forEach((step) => root.style.removeProperty(`--brand-${step}`));
  ["--d-brand", "--d-brand-hover", ...Array.from({ length: 7 }, (_, i) => `--g${i + 1}`), ...Array.from({ length: 7 }, (_, i) => `--gw${i + 1}`)].forEach((name) => root.style.removeProperty(name));
  if (!selected || ["azul", "roxo", "rosa", "verde", "ambar", "ciano", "rubi", "preto", "menta", "por-do-sol", "oceano", "candy", "grafite"].includes(id)) return;
  const stop = (index: number) => toRgb(selected.stops[index]).join(" ");
  ["50", "100", "200", "300"].forEach((step, index) => root.style.setProperty(`--brand-${step}`, mixWithWhite(selected.stops[0], [0.94, 0.82, 0.62, 0.36][index])));
  [400, 500, 600, 700, 800, 900].forEach((step, index) => root.style.setProperty(`--brand-${step}`, stop([0, 1, 2, 4, 5, 6][index])));
  root.style.setProperty("--d-brand", stop(3));
  root.style.setProperty("--d-brand-hover", stop(4));
  selected.stops.forEach((color, index) => {
    root.style.setProperty(`--g${index + 1}`, color);
    root.style.setProperty(`--gw${index + 1}`, `rgb(${toRgb(color).join(" ")} / 0.30)`);
  });
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
