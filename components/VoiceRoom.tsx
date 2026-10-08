"use client";

import { Headphones } from "lucide-react";

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
    <main className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto bg-discord-bg-primary p-3 sm:p-6">
      <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-secondary text-center shadow-xl">
        <div className="h-2 w-full bg-theme-gradient" />
        <div className="p-5 sm:p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-theme-gradient text-white sm:mb-5">
            <Headphones className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-discord-text-muted">
            Canal de voz
          </p>
          <h1 className="mt-2 break-words text-2xl font-bold text-discord-header-primary">{channelName}</h1>

          {connected ? (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-discord-text-muted">
              Você está conectado. Clique no canal de novo, ou no botão abaixo, para abrir a tela da
              chamada com câmera, apresentação de tela e chat.
            </p>
          ) : (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-discord-text-muted">
              Clique uma vez no canal para entrar. Todos que entrarem neste canal ficam na mesma
              chamada.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-5 rounded-lg bg-discord-danger/15 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {connected ? (
              <>
                <button
                  type="button"
                  onClick={onOpenCall}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-theme-gradient px-5 py-3 font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white/60"
                >
                  Abrir tela da chamada
                </button>
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="min-h-12 rounded-xl border border-white/15 px-5 py-3 font-semibold text-discord-text-normal transition hover:bg-white/10"
                >
                  Desconectar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onJoin}
                disabled={connecting}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-theme-gradient px-5 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-white/60"
              >
                {connecting ? "Conectando…" : "Entrar na chamada"}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
