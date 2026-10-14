"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

export function DesktopTitleBar() {
  const [enabled, setEnabled] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const desktop = window.sekaiDesktop;
    if (desktop?.platform !== "win32") return;

    setEnabled(true);
    document.documentElement.classList.add("sekai-desktop");
    void desktop.getWindowState?.().then((state) => setMaximized(state.maximized));
    const unsubscribe = desktop.onWindowMaximized?.(setMaximized);
    return () => {
      unsubscribe?.();
      document.documentElement.classList.remove("sekai-desktop", "sekai-call-fullscreen");
    };
  }, []);

  if (!enabled) return null;

  const buttonClass = "grid h-[34px] w-[46px] shrink-0 place-items-center text-[#b5bac1] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/70";

  return <>
    <div id="sekai-titlebar-spacer" className="h-[34px] shrink-0" aria-hidden="true" />
    <header
      id="sekai-titlebar"
      className="fixed inset-x-0 top-0 z-[1000] flex h-[34px] select-none items-center border-b border-white/[.04] bg-[#111214] text-[#dbdee1]"
      style={{ WebkitAppRegion: "drag" } as CSSProperties & { WebkitAppRegion: string }}
      onDoubleClick={() => void window.sekaiDesktop?.toggleMaximizeWindow?.().then(setMaximized)}
    >
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3 text-[12px] font-medium tracking-[.01em]">
        <img src="/sekai-logo-red.png?v=0.2.2" alt="Sekai" className="h-[18px] w-[18px] object-contain" draggable={false} />
        <span className="truncate">Sekai</span>
      </div>
      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as CSSProperties & { WebkitAppRegion: string }}>
        <button type="button" className={buttonClass} aria-label="Minimizar janela" title="Minimizar" onClick={() => void window.sekaiDesktop?.minimizeWindow?.()}>
          <Minus size={15} strokeWidth={1.7} />
        </button>
        <button type="button" className={buttonClass} aria-label={maximized ? "Restaurar janela" : "Maximizar janela"} title={maximized ? "Restaurar" : "Maximizar"} onClick={() => void window.sekaiDesktop?.toggleMaximizeWindow?.().then(setMaximized)}>
          {maximized ? <Copy size={13} strokeWidth={1.7} /> : <Square size={13} strokeWidth={1.7} />}
        </button>
        <button type="button" className={`${buttonClass} hover:bg-[#c42b1c] hover:text-white`} aria-label="Fechar Sekai" title="Fechar" onClick={() => void window.sekaiDesktop?.closeWindow?.()}>
          <X size={16} strokeWidth={1.6} />
        </button>
      </div>
    </header>
  </>;
}
