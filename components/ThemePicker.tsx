"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Palette } from "lucide-react";
import { THEMES } from "@/lib/themes";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

interface ThemePickerProps {
  /** Para onde o menu abre em relação ao botão. */
  placement?: "up" | "down";
  align?: "left" | "right";
  className?: string;
}

function gradientOf(stops: string[]) {
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

export default function ThemePicker({ placement = "down", align = "right", className }: ThemePickerProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(288, window.innerWidth - 24);
    const height = menuRef.current?.getBoundingClientRect().height ?? Math.min(420, window.innerHeight * 0.7);
    const alignedLeft = align === "right" ? anchor.right - width : anchor.left;
    let top = placement === "up" ? anchor.top - height - 8 : anchor.bottom + 8;
    if (top + height > window.innerHeight - 12) top = anchor.top - height - 8;
    if (top < 12) top = Math.min(12, window.innerHeight - height - 12);
    setPosition({
      left: Math.max(12, Math.min(alignedLeft, window.innerWidth - width - 12)),
      top: Math.max(12, top),
    });
  }, [align, placement]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((value) => !value);
        }}
        title="Cor do tema"
        aria-label="Escolher a cor do tema"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <Palette className="h-[18px] w-[18px]" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Temas de cor"
          className="fixed z-[1100] max-h-[70vh] w-[min(288px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-white/10 bg-discord-bg-floating p-3 shadow-2xl"
          style={position ?? { left: 12, top: 12 }}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-discord-text-muted">
            Cor do tema
          </p>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((option) => {
              const active = option.id === theme;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTheme(option.id)}
                  className={cn(
                    "group overflow-hidden rounded-lg border text-left transition",
                    active ? "border-white/70" : "border-white/10 hover:border-white/40"
                  )}
                >
                  <span
                    className="relative block h-9 w-full"
                    style={{ backgroundImage: gradientOf(option.stops) }}
                  >
                    {active && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    )}
                  </span>
                  <span className="block truncate px-2 py-1 text-xs font-medium text-discord-text-normal">
                    {option.name}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-discord-text-muted">
            Muda só as cores, neste navegador.
          </p>
        </div>, document.body
      )}
    </div>
  );
}
