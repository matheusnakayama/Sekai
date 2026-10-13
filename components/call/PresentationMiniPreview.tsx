'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Participant } from '@/lib/types';

type Point = { x: number; y: number };
type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
  view: Window;
};

export default function PresentationMiniPreview({
  participant,
  onOpen,
  onStopWatching,
}: {
  participant: Participant;
  onOpen: () => void;
  onStopWatching: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const positionRef = useRef<Point | null>(null);
  const suppressOpenClickRef = useRef(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const videoTrackKey = (participant.stream?.getVideoTracks() ?? []).map((track) => track.id).join(',');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = (participant.stream?.getVideoTracks() ?? []).filter((track) => track.readyState === 'live');
    video.srcObject = tracks.length ? new MediaStream(tracks) : null;
    if (tracks.length) void video.play().catch(() => {});
    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [participant.stream, videoTrackKey]);

  useEffect(() => {
    const view = previewRef.current?.ownerDocument.defaultView;
    if (!view) return;
    const keepInView = () => {
      const current = positionRef.current;
      const rect = previewRef.current?.getBoundingClientRect();
      if (!current || !rect) return;
      const margin = 12;
      const next = {
        x: clamp(current.x, margin, Math.max(margin, view.innerWidth - rect.width - margin)),
        y: clamp(current.y, margin, Math.max(margin, view.innerHeight - rect.height - margin)),
      };
      positionRef.current = next;
      setPosition(next);
    };
    view.addEventListener('resize', keepInView);
    return () => view.removeEventListener('resize', keepInView);
  }, []);

  function updatePosition(next: Point) {
    positionRef.current = next;
    setPosition(next);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as Element | null;
    if (event.button !== 0 || (target && typeof target.closest === 'function' && target.closest('[data-no-drag]'))) return;
    const view = event.currentTarget.ownerDocument.defaultView;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!view) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
      view,
    };
    updatePosition({ x: rect.left, y: rect.top });
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    drag.moved = true;
    const margin = 12;
    drag.x = clamp(drag.originX + deltaX, margin, Math.max(margin, drag.view.innerWidth - drag.width - margin));
    drag.y = clamp(drag.originY + deltaY, margin, Math.max(margin, drag.view.innerHeight - drag.height - margin));
    updatePosition({ x: drag.x, y: drag.y });
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    if (!drag.moved) return;

    // Mantém a posição exata escolhida; a miniatura pode ficar em qualquer ponto da tela.
    updatePosition({ x: drag.x, y: drag.y });
    suppressOpenClickRef.current = true;
    drag.view.setTimeout(() => { suppressOpenClickRef.current = false; }, 350);
  }

  function openCallFromPreview() {
    if (suppressOpenClickRef.current) {
      suppressOpenClickRef.current = false;
      return;
    }
    onOpen();
  }

  return (
    <aside
      ref={previewRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      title="Arraste para mover a miniatura"
      style={position ? {
        left: position.x,
        top: position.y,
        right: 'auto',
        bottom: 'auto',
        transition: dragging
          ? 'transform 160ms ease-out'
          : 'left 420ms cubic-bezier(.22,1,.36,1), top 420ms cubic-bezier(.22,1,.36,1), transform 420ms cubic-bezier(.22,1,.36,1)',
      } : undefined}
      className={`fixed bottom-4 right-4 z-[240] w-[min(360px,calc(100vw-2rem))] touch-none select-none overflow-hidden rounded-2xl border border-white/15 bg-[#111214] shadow-2xl ring-1 ring-black/40 will-change-[left,top,transform] sm:bottom-6 sm:right-6 ${dragging ? 'scale-[1.02] cursor-grabbing' : 'cursor-grab'}`}
    >
      <button
        type="button"
        onClick={openCallFromPreview}
        aria-label={`Voltar à chamada e ver a apresentação de ${participant.name}`}
        className="group relative block aspect-video w-full overflow-hidden bg-black text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-contain" />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-8 text-sm font-medium text-white">
          <span className="min-w-0 truncate">Apresentação de {participant.name}</span>
          <span className="shrink-0 rounded-full bg-white/15 px-2 py-1 text-[11px] text-white/90 backdrop-blur group-hover:bg-white/25">Voltar à chamada</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onStopWatching}
        aria-label="Parar de assistir à apresentação"
        title="Parar de assistir"
        data-no-drag
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg backdrop-blur transition hover:bg-black"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}
