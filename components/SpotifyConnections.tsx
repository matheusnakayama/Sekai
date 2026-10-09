"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { beginSpotifyConnect, clearNowPlaying, readSpotifySession, SPOTIFY_CLIENT_ID, spotifyRedirectUri, writeSpotifySession, type SpotifySession } from "@/lib/spotify";

export function SpotifyConnections({ userId }: { userId: string }) {
  const [session, setSession] = useState<SpotifySession | null>(null);
  const [notice, setNotice] = useState("");
  const [schemaReady, setSchemaReady] = useState(true);

  useEffect(() => {
    const load = () => setSession(readSpotifySession(userId));
    load();
    window.addEventListener("sekai-spotify-session", load);
    return () => window.removeEventListener("sekai-spotify-session", load);
  }, [userId]);

  useEffect(() => {
    void createClient().from("user_now_playing").select("user_id").limit(1).then(({ error }) => {
      setSchemaReady(!error);
    });
  }, []);

  function update(patch: Partial<SpotifySession>) {
    if (!session) return;
    const next = { ...session, ...patch };
    writeSpotifySession(userId, next);
    setSession(next);
  }

  async function disconnect() {
    writeSpotifySession(userId, null);
    setSession(null);
    await clearNowPlaying(userId).catch(() => undefined);
  }

  return (
    <section className="settings-section-enter">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Contas</p>
        <h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Conexões</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-discord-text-muted">Conecte o Spotify para mostrar no seu perfil a faixa que você está ouvindo, enquanto você não estiver invisível.</p>
      </div>

      {!schemaReady && <p className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">Para as outras pessoas verem a faixa, cole o arquivo db/spotify_now_playing_migration.sql no SQL Editor do Supabase.</p>}
      {!SPOTIFY_CLIENT_ID && <p className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm leading-6 text-discord-text-muted">Defina NEXT_PUBLIC_SPOTIFY_CLIENT_ID no ambiente e cadastre este endereço de retorno no app do Spotify: {typeof window !== "undefined" ? spotifyRedirectUri() : "/spotify/callback"}.</p>}

      <article className="rounded-2xl border border-white/[0.08] bg-discord-bg-primary p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#1DB954] text-lg font-black text-black">S</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-discord-header-primary">Spotify</h2>
            <p className="mt-1 text-xs leading-5 text-discord-text-muted">{session ? `Conectado como ${session.displayName}` : "Mostre a música atual no perfil, do mesmo jeito que uma atividade ao vivo."}</p>
          </div>
          {session
            ? <button type="button" onClick={() => void disconnect()} className="rounded-xl px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/10">Desconectar</button>
            : <button type="button" disabled={!SPOTIFY_CLIENT_ID} onClick={() => void beginSpotifyConnect().catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível abrir o Spotify."))} className="rounded-xl bg-[#1DB954] px-3 py-2 text-xs font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">Conectar</button>}
        </div>
        {session && (
          <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
            <Toggle checked={session.showOnProfile} title="Exibir no perfil" text="Mostra a capa, a música e o artista quando alguém abre seu perfil." onChange={(value) => update({ showOnProfile: value })} />
            <Toggle checked={session.showAsStatus} title="Exibir o Spotify como seu status" text="Quem estiver online vê que você está ouvindo esta faixa." onChange={(value) => update({ showAsStatus: value })} />
          </div>
        )}
        {notice && <p role="alert" className="mt-3 text-xs text-rose-200">{notice}</p>}
      </article>
    </section>
  );
}

function Toggle({ checked, title, text, onChange }: { checked: boolean; title: string; text: string; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-discord-text-normal">{title}</p>
        <p className="mt-1 text-xs leading-5 text-discord-text-muted">{text}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={title} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-[#1DB954]" : "bg-white/15"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}
