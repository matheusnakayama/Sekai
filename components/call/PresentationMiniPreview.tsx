'use client';

import { useEffect, useRef } from 'react';
import type { Participant } from '@/lib/types';

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

  return (
    <aside className="fixed bottom-4 right-4 z-[240] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#111214] shadow-2xl ring-1 ring-black/40 sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={onOpen}
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
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg backdrop-blur transition hover:bg-black"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}
