"use client";

import { ExternalLink, Headphones } from "lucide-react";

interface VoiceRoomProps {
  channelName: string;
  roomId: string;
}

export function VoiceRoom({ channelName, roomId }: VoiceRoomProps) {
  const callAppUrl = process.env.NEXT_PUBLIC_CALL_APP_URL?.trim().replace(/\/$/, "");
  const callUrl = callAppUrl
    ? `${callAppUrl}/sala/${encodeURIComponent(roomId)}`
    : null;

  return (
    <main className="flex h-full min-w-0 flex-1 items-center justify-center bg-discord-bg-primary p-6">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-discord-bg-secondary p-8 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-discord-brand/20 text-discord-brand">
          <Headphones className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-discord-text-muted">
          Canal de voz
        </p>
        <h1 className="mt-2 text-2xl font-bold text-discord-header-primary">{channelName}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-discord-text-muted">
          A chamada, o microfone, a câmera e a apresentação de tela abrem no app de chamadas.
          Todos que entrarem neste canal usarão a mesma sala.
        </p>

        {callUrl ? (
          <a
            href={callUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-discord-brand px-5 py-3 font-semibold text-white transition hover:bg-discord-brand-hover focus:outline-none focus:ring-2 focus:ring-discord-brand focus:ring-offset-2 focus:ring-offset-discord-bg-secondary"
          >
            Abrir chamada
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <p role="alert" className="mt-7 rounded-lg border border-discord-danger/40 bg-discord-danger/10 px-4 py-3 text-sm text-discord-danger">
            O endereço do app de chamadas ainda não foi configurado. Defina a variável
            NEXT_PUBLIC_CALL_APP_URL nas configurações da Vercel.
          </p>
        )}
      </section>
    </main>
  );
}
