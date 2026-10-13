"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function GameActivityPublisher({ userId, presence }: { userId: string; presence?: string | null }) {
  useEffect(() => {
    const getGameActivity = window.sekaiDesktop?.getGameActivity;
    const subscribeGameActivity = window.sekaiDesktop?.onGameActivity;
    if (!userId || !getGameActivity) return;
    let stopped = false;
    const supabase = createClient();

    async function publish() {
      if (stopped) return;
      try {
        const snapshot = await getGameActivity?.();
        if (stopped || !snapshot) return;
        const game = presence === "offline" ? null : snapshot.currentGame;
        if (!game) {
          await supabase.from("user_game_activity").delete().eq("user_id", userId);
          return;
        }
        const { error } = await supabase.from("user_game_activity").upsert({
          user_id: userId,
          game_id: game.gameId,
          game_name: game.gameName,
          started_at: new Date(game.startedAt).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (error) console.warn("Não foi possível publicar sua atividade de jogo:", error.message);
      } catch (error) {
        if (!stopped) console.warn("Falha ao sincronizar atividade de jogo:", error);
      }
    }

    const unsubscribe = subscribeGameActivity?.(() => { void publish(); });
    void publish();
    const timer = window.setInterval(() => void publish(), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      unsubscribe?.();
    };
  }, [presence, userId]);
  return null;
}
