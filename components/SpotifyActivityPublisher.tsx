"use client";

import { useEffect } from "react";
import { clearNowPlaying, displayMode, ensureSpotifyToken, fetchCurrentlyPlaying, publishNowPlaying, readSpotifySession } from "@/lib/spotify";

export function SpotifyActivityPublisher({ userId, presence }: { userId: string; presence?: string | null }) {
  useEffect(() => {
    let stopped = false;
    async function tick() {
      const session = readSpotifySession(userId);
      const hidden = !session || presence === "offline" || (!session.showOnProfile && !session.showAsStatus);
      if (hidden) {
        if (session) await clearNowPlaying(userId).catch(() => undefined);
        return;
      }
      try {
        const fresh = await ensureSpotifyToken(userId);
        if (!fresh || stopped) return;
        const playing = await fetchCurrentlyPlaying(fresh.accessToken);
        if (stopped) return;
        if (!playing) await clearNowPlaying(userId);
        else await publishNowPlaying(userId, playing, displayMode(fresh));
      } catch {
        // A próxima rodada tenta de novo. Sem tabela no Supabase, o perfil simplesmente não mostra a faixa.
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 15000);
    const onSession = () => void tick();
    window.addEventListener("sekai-spotify-session", onSession);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("sekai-spotify-session", onSession);
    };
  }, [presence, userId]);
  return null;
}
