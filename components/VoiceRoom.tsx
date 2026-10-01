"use client";

import { useEffect, useState } from "react";
import { Headphones } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RoomClient from "@/components/call/RoomClient";

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
  roomId: string;
  displayName: string;
  openCallSignal: number;
}

export function VoiceRoom({ channelName, roomId, displayName, openCallSignal }: VoiceRoomProps) {
  const supabase = createClient();
  const [callOpen, setCallOpen] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function enterCall() {
    setError("");
    setLoading(true);
    const { data, error: sessionError } = await supabase.auth.getSession();
    setLoading(false);

    if (sessionError || !data.session?.access_token) {
      setError("Sua sessão expirou. Saia e entre novamente no Sekai.");
      return;
    }

    setAccessToken(data.session.access_token);
    setCallOpen(true);
  }

  useEffect(() => {
    if (openCallSignal > 0) void enterCall();
    // O sinal só muda quando a pessoa clica novamente no canal de voz ativo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCallSignal]);

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
          Entre para conversar. Todos que abrirem este canal entrarão na mesma chamada, com câmera,
          microfone, compartilhamento de tela e chat.
        </p>
        {error && <p role="alert" className="mt-5 rounded-lg bg-discord-danger/15 p-3 text-sm text-red-300">{error}</p>}
        <button
          type="button"
          onClick={() => void enterCall()}
          disabled={loading}
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-discord-brand px-5 py-3 font-semibold text-white transition hover:bg-discord-brand-hover disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-discord-brand focus:ring-offset-2 focus:ring-offset-discord-bg-secondary"
        >
          {loading ? "Conectando…" : "Entrar na chamada"}
        </button>
      </section>

      {callOpen && accessToken && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#0b0d13]">
          <RoomClient
            roomId={roomId}
            roomName={channelName}
            initialName={displayName}
            accessToken={accessToken}
            onClose={() => setCallOpen(false)}
          />
        </div>
      )}
    </main>
  );
}
