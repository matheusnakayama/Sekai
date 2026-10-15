"use client";

import { useEffect, useRef } from "react";

type Entry = { current: () => void };
const stack: Entry[] = [];
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  if ((event.key !== "Escape" && event.key !== "Esc") || event.isComposing) return;
  if (event.target instanceof Element && event.target.closest("[data-esc-local]")) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopPropagation();
  top.current();
}

/**
 * Fecha a tela mais recente ao apertar Esc. Com telas empilhadas
 * (ex.: confirmação dentro das configurações), só a do topo reage.
 */
export function useEscapeKey(handler: () => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = ref;
    stack.push(entry);
    if (!listening) {
      window.addEventListener("keydown", onKeyDown, true);
      listening = true;
    }
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length && listening) {
        window.removeEventListener("keydown", onKeyDown, true);
        listening = false;
      }
    };
  }, [enabled]);
}
