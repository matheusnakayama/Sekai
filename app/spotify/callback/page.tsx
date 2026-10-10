"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { finishSpotifyConnect, publishConnection, writeSpotifySession } from "@/lib/spotify";

function Callback() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Conectando o Spotify…");

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");
    if (error || !code) {
      setMessage("A conexão com o Spotify foi cancelada.");
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await createClient().auth.getUser();
      if (!data.user) {
        if (!cancelled) setMessage("Entre no Sekai antes de conectar o Spotify.");
        return;
      }
      try {
        const session = await finishSpotifyConnect(code);
        writeSpotifySession(data.user.id, session);
        await publishConnection(data.user.id, { displayName: session.displayName, profileUrl: session.profileUrl }).catch(() => undefined);
        window.location.replace("/");
      } catch (connectError) {
        if (!cancelled) setMessage(connectError instanceof Error ? connectError.message : "Não foi possível concluir a conexão.");
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  return (
    <main className="grid min-h-screen place-items-center bg-discord-bg-primary px-6 text-center">
      <p className="max-w-md text-sm leading-6 text-discord-text-normal">{message}</p>
    </main>
  );
}

export default function SpotifyCallbackPage() {
  return <Suspense fallback={null}><Callback /></Suspense>;
}
