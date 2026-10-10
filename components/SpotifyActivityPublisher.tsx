"use client";

import { useEffect } from "react";
import { clearNowPlaying, displayMode, ensureSpotifyToken, fetchCurrentlyPlaying, publishConnection, publishNowPlaying, readSpotifySession, spotifyAccount, writeSpotifySession } from "@/lib/spotify";

export function SpotifyActivityPublisher({ userId, presence }: { userId: string; presence?: string | null }) {
  useEffect(() => {
    let stopped = false;
    async function tick() {
      const session = readSpotifySession(userId);
      if (!session) return;
      try {
        const fresh = await ensureSpotifyToken(userId);
        if (!fresh || stopped) return;
        let account = fresh;
        if (!account.profileUrl) {
          const loaded = await spotifyAccount(account.accessToken);
          if (loaded?.profileUrl) {
            account = { ...account, displayName: loaded.displayName || account.displayName, profileUrl: loaded.profileUrl };
            writeSpotifySession(userId, account);
          }
        }
        if (stopped) return;
        await publishConnection(userId, { displayName: account.displayName, profileUrl: account.profileUrl }).catch(() => undefined);
        const hidden = presence === "offline" || (!account.showOnProfile && !account.showAsStatus);
        if (hidden) {
          await clearNowPlaying(userId).catch(() => undefined);
          return;
        }
        const playing = await fetchCurrentlyPlaying(account.accessToken);
        if (stopped) return;
        if (!playing) await clearNowPlaying(userId);
        else await publishNowPlaying(userId, playing, displayMode(account));
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
