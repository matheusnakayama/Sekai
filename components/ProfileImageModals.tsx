"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Film, ImagePlus, RotateCcw, X } from "lucide-react";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { HoverGifImage } from "@/components/HoverGifImage";

export type ProfileImageKind = "avatar" | "banner";
export type ImageCrop = { x: number; y: number; zoom: number };
export type SelectedProfileMedia = { file: File | null; url: string };

export function ProfileImagePickerModal({
  kind,
  recentImages,
  onSelect,
  onClose,
}: {
  kind: ProfileImageKind;
  recentImages: string[];
  onSelect: (selection: SelectedProfileMedia) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const gifInput = useRef<HTMLInputElement>(null);
  const heading = kind === "avatar" ? "Selecionar avatar" : "Selecionar banner";
  const recentHeading = kind === "avatar" ? "Avatares recentes" : "Banners recentes";

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function chooseFile(file?: File) {
    if (!file) return;
    onSelect({ file, url: "" });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={heading} className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-white/10 bg-[#232329] text-white shadow-[0_28px_90px_rgba(0,0,0,.65)]">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div><h2 className="text-lg font-bold">{heading}</h2><p className="mt-1 text-xs text-white/50">Escolha uma foto, um GIF ou uma imagem que você já usou.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar seleção" className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"><X size={20}/></button>
        </header>

        <div className="grid grid-cols-2 gap-3 px-6 pt-5">
          <button type="button" onClick={() => photoInput.current?.click()} className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-[#303036] px-4 text-center transition hover:border-white/20 hover:bg-[#38383f]">
            <ImagePlus size={24} className="text-white/75"/><span className="text-sm font-semibold">Enviar foto</span><span className="text-[11px] text-white/45">PNG, JPG ou WebP</span>
          </button>
          <button type="button" onClick={() => gifInput.current?.click()} className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-[#303036] px-4 text-center transition hover:border-white/20 hover:bg-[#38383f]">
            <Film size={24} className="text-white/75"/><span className="text-sm font-semibold">Escolher GIF</span><span className="text-[11px] text-white/45">GIF animado do seu dispositivo</span>
          </button>
          <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}/>
          <input ref={gifInput} type="file" accept="image/gif" className="hidden" onChange={(event) => { chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}/>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{recentHeading}</h3><span className="text-[11px] text-white/40">Até 6 itens</span></div>
          {recentImages.length ? (
            <div className="flex flex-wrap gap-2.5">
              {recentImages.slice(0, 6).map((url, index) => (
                <button key={`${url}-${index}`} type="button" onClick={() => onSelect({ file: null, url })} title={`Usar ${recentHeading.toLowerCase().replace(/s$/, "") } recente`} className={`group relative overflow-hidden border-2 border-transparent bg-[#17171a] transition hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${kind === "avatar" ? "h-14 w-14 rounded-full" : "h-14 w-24 rounded-lg"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <HoverGifImage src={url} alt="" className="h-full w-full object-cover"/>
                  <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"><Check size={18}/></span>
                </button>
              ))}
            </div>
          ) : <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-xs text-white/45">Suas imagens usadas anteriormente aparecerão aqui depois de salvar.</p>}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function ProfileImageCropModal({
  kind,
  src,
  initialCrop,
  onApply,
  onClose,
}: {
  kind: ProfileImageKind;
  src: string;
  initialCrop: ImageCrop;
  onApply: (crop: ImageCrop) => void;
  onClose: () => void;
}) {
  const [crop, setCrop] = useState(initialCrop);
  const [mounted, setMounted] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const isAvatar = kind === "avatar";

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointerX: event.clientX, pointerY: event.clientY, x: crop.x, y: crop.y };
  }

  function moveImage(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    const frame = frameRef.current;
    if (!start || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const fitScale = imageDimensions
      ? Math.max(bounds.width / imageDimensions.width, bounds.height / imageDimensions.height) * (crop.zoom / 100)
      : 0;
    const maxOffsetX = imageDimensions ? Math.max(0, imageDimensions.width * fitScale - bounds.width) : 0;
    const maxOffsetY = imageDimensions ? Math.max(0, imageDimensions.height * fitScale - bounds.height) : 0;
    setCrop((value) => ({
      ...value,
      x: maxOffsetX > 0 ? clamp(start.x - ((event.clientX - start.pointerX) / maxOffsetX) * 100, 0, 100) : start.x,
      y: maxOffsetY > 0 ? clamp(start.y - ((event.clientY - start.pointerY) / maxOffsetY) * 100, 0, 100) : start.y,
    }));
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[230] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={`Editar ${isAvatar ? "avatar" : "banner"}`} className="w-full max-w-[500px] overflow-hidden rounded-2xl border border-white/10 bg-[#232329] text-white shadow-[0_28px_90px_rgba(0,0,0,.7)]">
        <header className="flex items-center justify-between px-6 py-5"><div><h2 className="text-lg font-bold">Editar {isAvatar ? "avatar" : "banner"}</h2><p className="mt-1 text-xs text-white/50">Arraste para reposicionar e ajuste o zoom.</p></div><button type="button" onClick={onClose} aria-label="Fechar editor" className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"><X size={20}/></button></header>
        <div className="mx-6 overflow-hidden rounded-xl bg-[#19191d] p-3">
          <div
            ref={frameRef}
            onPointerDown={beginDrag}
            onPointerMove={moveImage}
            onPointerUp={() => { dragStart.current = null; }}
            onPointerCancel={() => { dragStart.current = null; }}
            className={`relative mx-auto overflow-hidden touch-none bg-[#34343a] cursor-grab active:cursor-grabbing ${isAvatar ? "aspect-square w-56 rounded-xl" : "aspect-[3.125/1] w-full rounded-lg"}`}
          >
            <CroppedProfileImage
              src={src}
              alt="Prévia do recorte"
              positionX={crop.x}
              positionY={crop.y}
              zoom={crop.zoom}
              onImageDimensions={(width, height) => setImageDimensions((current) => current && current.width === width && current.height === height ? current : { width, height })}
              pauseGif={false}
              className={isAvatar ? "inset-[9%] rounded-full" : "rounded-lg"}
            />
          </div>
        </div>
        <div className="px-6 pt-5">
          <label className="flex items-center gap-3 text-xs text-white/70"><span className="w-10 shrink-0">Zoom</span><input type="range" min={100} max={250} step={1} value={crop.zoom} onChange={(event) => setCrop((value) => ({ ...value, zoom: Number(event.target.value) }))} aria-label="Zoom da imagem" className="min-w-0 flex-1 accent-indigo-400"/><span className="w-10 text-right tabular-nums">{crop.zoom}%</span></label>
        </div>
        <footer className="flex items-center gap-2 px-6 pb-5 pt-6">
          <button type="button" onClick={() => setCrop({ x: 50, y: 50, zoom: 100 })} className="mr-auto inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-white/55 transition hover:bg-white/5 hover:text-white"><RotateCcw size={14}/>Redefinir</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-[#35353b] px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-[#414148]">Cancelar</button>
          <button type="button" onClick={() => onApply(crop)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"><Check size={16}/>Aplicar</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.round(Math.max(min, Math.min(max, value)));
}
