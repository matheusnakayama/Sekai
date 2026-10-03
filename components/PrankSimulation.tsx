"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function PrankSimulation({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function closeAndOpenYouTube() {
    // A navegação só ocorre após uma ação explícita do próprio usuário.
    // Manter as duas aberturas síncronas neste clique também ajuda a respeitar
    // a permissão de pop-ups do navegador.
    window.open("https://www.youtube.com/", "_blank", "noopener,noreferrer");
    window.open("https://www.youtube.com/", "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="sekai-prank-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-[#111214] shadow-2xl shadow-black/50">
        <header className="flex items-center justify-between px-6 pt-6"><span className="rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-200">Simulação visual do Sekai</span><button type="button" onClick={closeAndOpenYouTube} aria-label="Fechar e abrir YouTube" className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"><X size={18}/></button></header>
        <div className="px-6 pb-6 pt-5">
          <div className="rounded-xl bg-[#080909] p-4 font-mono text-xs leading-6 text-emerald-300"><p>&gt; executando brincadeira...</p><p className="text-emerald-200/75">&gt; nenhum arquivo acessado</p><p className="text-emerald-200/75">&gt; nenhuma alteração feita</p></div>
          <h2 id="sekai-prank-title" className="mt-5 text-xl font-bold text-white">Pegadinha! 😅</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">Isto é só uma animação dentro do Sekai. Seu dispositivo e seus arquivos não foram acessados nem alterados.</p>
          <button type="button" onClick={closeAndOpenYouTube} className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300">Fechar e abrir YouTube</button>
          <p className="mt-3 text-center text-[11px] text-white/40">A ação abre duas guias do YouTube. O navegador pode bloquear pop-ups se essa permissão estiver desativada.</p>
        </div>
      </section>
    </div>
  );
}
