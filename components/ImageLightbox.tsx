"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Visualização da imagem" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Fechar imagem" className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/55 text-white transition hover:bg-white/15">
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} className="max-h-full max-w-full select-none rounded-lg object-contain shadow-2xl" />
    </div>
  );
}
