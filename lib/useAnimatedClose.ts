"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Toca a animação de saída antes de chamar onClose.
 * Uso: const { closing, requestClose } = useAnimatedClose(onClose);
 */
export function useAnimatedClose(onClose: () => void, duration = 180) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { closeRef.current(); return; }
    setClosing(true);
    timer.current = window.setTimeout(() => closeRef.current(), duration);
  }, [duration]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return { closing, requestClose };
}
