"use client";

import { PhoneCall } from "lucide-react";

// Mantido para compatibilidade com o hook LiveKit legado ainda presente no projeto.
export interface VoiceParticipant {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isCameraOn?: boolean;
  isSharingScreen?: boolean;
  videoStreamElementId?: string;
}

interface VoiceRoomProps {
  channelName: string;
  /** Você já está conectado a este canal (a chamada continua rodando em segundo plano). */
  connected: boolean;
  connecting: boolean;
  error: string;
  onJoin: () => void;
  onOpenCall: () => void;
  onDisconnect: () => void;
}

/**
 * Tela de apresentação do canal de voz. A chamada em si fica em `components/call/RoomClient`,
 * montada pela página principal, para continuar ativa mesmo quando você muda de canal.
 */
export function VoiceRoom({
  channelName,
  connected,
  connecting,
  error,
  onJoin,
  onOpenCall,
  onDisconnect,
}: VoiceRoomProps) {
  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto bg-[#111214] p-4 sm:p-6">
      <section className="w-full max-w-xl text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-white/65">
          <PhoneCall className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">{channelName}</h1>

        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/50">
          {connected
            ? "Você está conectado. Abra a chamada para ver os participantes e compartilhar sua tela."
            : "Ninguém está na chamada agora. Entre para conversar por voz com as pessoas deste canal."}
        </p>

        {error && (
          <p role="alert" className="mx-auto mt-5 max-w-md rounded-xl border border-red-400/15 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {connected ? (
              <>
                <button
                  type="button"
                  onClick={onOpenCall}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 font-semibold text-[#111214] transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/60"
                >
                  Abrir tela da chamada
                </button>
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="min-h-11 rounded-lg border border-white/10 px-5 py-2.5 font-medium text-white/75 transition hover:bg-white/[0.06]"
                >
                  Desconectar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onJoin}
                disabled={connecting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 font-semibold text-[#111214] transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-white/60"
              >
                {connecting ? "Conectando…" : "Entrar na chamada"}
              </button>
            )}
        </div>
      </section>
    </main>
  );
}
