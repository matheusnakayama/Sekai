"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageCircle, StickyNote, UserRound, VideoOff, Volume2, VolumeX } from "lucide-react";
import { readCallUserMix, writeCallUserMix, type CallUserMix } from "@/lib/callUserMix";

export function CallUserMenu({
  userId,
  name,
  isSelf = false,
  x,
  y,
  soundEffectsMuted = false,
  onClose,
  onOpenProfile,
  onMessage,
  onToggleSoundEffects,
}: {
  userId: string;
  name: string;
  isSelf?: boolean;
  x: number;
  y: number;
  soundEffectsMuted?: boolean;
  onClose: () => void;
  onOpenProfile?: () => void;
  onMessage?: () => void;
  onToggleSoundEffects?: () => void;
}) {
  const [mix, setMix] = useState<CallUserMix>(() => readCallUserMix(userId));
  const [noteOpen, setNoteOpen] = useState(false);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const menuWidth = 264;
  const left = typeof window === "undefined" ? x : Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const top = typeof window === "undefined" ? y : Math.max(8, Math.min(y, window.innerHeight - 520));

  useEffect(() => {
    setMix(readCallUserMix(userId));
  }, [userId]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function update(patch: Partial<CallUserMix>) {
    setMix(writeCallUserMix(userId, patch));
  }

  const percent = Math.round(mix.volume * 100);

  return (
    <>
      <button type="button" aria-label="Fechar menu do usuário" className="fixed inset-0 z-[420] cursor-default" onMouseDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }} />
      <div
        role="menu"
        aria-label={`Ações de chamada para ${name}`}
        style={{ left, top, width: menuWidth }}
        onMouseDown={(event) => event.stopPropagation()}
        className="fixed z-[430] max-h-[min(520px,calc(100dvh-16px))] overflow-y-auto rounded-md border border-white/[0.08] bg-[#18191c] p-1.5 text-[#dbdee1] shadow-[0_12px_32px_rgba(0,0,0,.55)]"
      >
        <p className="px-2 py-1.5 text-xs font-semibold text-white/45">{mix.nickname.trim() || name}</p>
        {onOpenProfile && <Row icon={<UserRound size={15} />} label="Perfil" onClick={() => { onOpenProfile(); onClose(); }} />}
        <Row icon={<MessageCircle size={15} />} label="Mensagem" disabled={isSelf || !onMessage} onClick={() => { onMessage?.(); onClose(); }} />
        <Row icon={<StickyNote size={15} />} label={mix.note ? "Editar nota" : "Adicionar nota"} hint="Visível apenas para você" onClick={() => setNoteOpen((open) => !open)} />
        {noteOpen && <label className="block px-2 pb-2 text-[11px] text-white/45">Nota<input value={mix.note} maxLength={200} onChange={(event) => update({ note: event.target.value })} className="mt-1 w-full rounded bg-black/30 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-white/10" /></label>}
        <Row icon={<UserRound size={15} />} label={mix.nickname ? "Editar apelido de amigo" : "Adicionar apelido de amigo"} onClick={() => setNicknameOpen((open) => !open)} />
        {nicknameOpen && <label className="block px-2 pb-2 text-[11px] text-white/45">Apelido<input value={mix.nickname} maxLength={32} onChange={(event) => update({ nickname: event.target.value })} placeholder={name} className="mt-1 w-full rounded bg-black/30 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-white/10" /></label>}

        <div className="my-1 h-px bg-white/10" />
        <div className="px-2 py-2">
          <div className="mb-2 flex items-center justify-between text-[13px] font-medium">
            <span>Volume do usuário</span>
            <span className="text-xs text-white/55">{percent}%</span>
          </div>
          <input
            aria-label={`Volume de ${name}`}
            type="range"
            min={0}
            max={200}
            step={1}
            value={percent}
            disabled={isSelf}
            onChange={(event) => update({ volume: Number(event.target.value) / 100, muted: Number(event.target.value) === 0 })}
            className="h-1.5 w-full cursor-pointer accent-[#5865f2] disabled:opacity-40"
          />
          <p className="mt-1 text-[10px] text-white/35">Padrão 100%. O máximo é 200%.</p>
        </div>
        <div className="my-1 h-px bg-white/10" />

        <Row icon={mix.muted ? <Volume2 size={15} /> : <VolumeX size={15} />} label={mix.muted ? "Ativar áudio" : "Silenciar"} disabled={isSelf} onClick={() => update({ muted: !mix.muted })} />
        <Row icon={<VolumeX size={15} />} label={soundEffectsMuted ? "Ativar efeitos sonoros" : "Silenciar efeitos sonoros"} disabled={isSelf || !onToggleSoundEffects} onClick={() => { onToggleSoundEffects?.(); }} />
        <Row icon={<VideoOff size={15} />} label={mix.videoHidden ? "Mostrar vídeo" : "Desativar vídeo"} disabled={isSelf} onClick={() => update({ videoHidden: !mix.videoHidden })} />
      </div>
    </>
  );
}

function Row({ icon, label, hint, disabled, onClick }: { icon: ReactNode; label: string; hint?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[13px] font-medium transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35">
      <span className="shrink-0 text-white/65">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint && <span className="block truncate text-[11px] font-normal text-white/40">{hint}</span>}
      </span>
    </button>
  );
}
