"use client";

import { useEffect, useRef, useState } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Cor do tema"
        aria-label="Escolher a cor do tema"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <Palette className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Temas de cor"
          className={cn(
            "absolute z-[200] w-64 rounded-xl border border-white/10 bg-discord-bg-floating p-3 shadow-2xl",
            placement === "up" ? "bottom-full mb-2" : "top-full mt-2",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-discord-text-muted">
            Cor do tema
          </p>
          <div className="grid grid-cols-2 gap-2">
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
        </div>
      )}
    </div>
  );
}
