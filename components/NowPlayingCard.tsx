"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowUpRight } from "lucide-react";
import { Gamepad2 } from "lucide-react";
import { isFreshActivity, readSpotifySession, safeSpotifyArtUrl, safeSpotifyProfileUrl, type NowPlaying, type PublicConnection } from "@/lib/spotify";

export function SpotifyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1DB954" />
      <path fill="#fff" d="M17.3 16.4a.62.62 0 0 1-.85.2c-2.3-1.4-5.2-1.72-8.6-.94a.62.62 0 1 1-.28-1.21c3.72-.85 6.9-.48 9.48 1.1.3.17.38.56.25.85Zm1.2-2.68a.78.78 0 0 1-1.07.26c-2.64-1.62-6.66-2.09-9.78-1.14a.78.78 0 0 1-.45-1.5c3.58-1.08 8.02-.55 11 1.31.36.22.48.7.3 1.07Zm.1-2.8c-3.1-1.84-8.2-2.01-11.16-1.11a.9.9 0 1 1-.52-1.73c3.4-1.03 9.76-.77 13.2 1.28a.9.9 0 1 1-.92 1.56Z" />
    </svg>
  );
}

export function useNowPlaying(userId: string, status: string) {
  const [activity, setActivity] = useState<NowPlaying | null>(null);
  useEffect(() => {
    if (!userId || status === "offline") { setActivity(null); return; }
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const { data, error } = await supabase.from("user_now_playing").select("track,artist,album,art_url,track_url,display,updated_at").eq("user_id", userId).maybeSingle();
      if (cancelled) return;
      if (error || !data || !isFreshActivity(data.updated_at)) { setActivity(null); return; }
      setActivity({
        track: data.track,
        artist: data.artist ?? "",
        album: data.album ?? "",
        artUrl: data.art_url ?? "",
        trackUrl: data.track_url ?? "",
        display: data.display === "status" || data.display === "profile" ? data.display : "both",
        updatedAt: data.updated_at,
      });
    }
    void load();
    const channel = supabase.channel(`now-playing-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_now_playing", filter: `user_id=eq.${userId}` }, () => { void load(); })
      .subscribe();
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [status, userId]);
  return status === "offline" ? null : activity;
}

export function NowPlayingCard({ activity }: { activity: NowPlaying }) {
  const line = (
    <span className="flex min-w-0 items-center gap-2 text-[12px] text-[#1DB954]">
      <SpotifyMark className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">Ouvindo <span className="font-semibold text-white">{activity.track}</span>{activity.artist ? ` · ${activity.artist}` : ""}</span>
    </span>
  );
  if (activity.display === "status") return <div className="mt-3">{line}</div>;
  const card = (
    <span className="mt-3 flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-black/25 p-2.5">
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#1DB954]/20">
        {safeSpotifyArtUrl(activity.artUrl) ? <img src={safeSpotifyArtUrl(activity.artUrl)} alt="" className="h-full w-full object-cover" /> : <SpotifyMark className="h-full w-full p-2" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#1DB954]"><SpotifyMark className="h-3.5 w-3.5" />Ouvindo Spotify</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-white">{activity.track}</span>
        {activity.artist && <span className="block truncate text-xs text-white/65">de {activity.artist}</span>}
      </span>
    </span>
  );
  if (!activity.trackUrl) return <div>{card}</div>;
  return <a href={activity.trackUrl} target="_blank" rel="noreferrer" className="block no-underline">{card}</a>;
}

export type ListeningActivity = { track: string; artUrl: string };

export function useListeningByUser(userIds: string[]) {
  const key = userIds.slice().sort().join(",");
  const [activities, setActivities] = useState<Record<string, ListeningActivity>>({});
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) { setActivities({}); return; }
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const rows: Array<{ user_id: string; track: string; art_url: string | null; display: string; updated_at: string }> = [];
      for (let index = 0; index < ids.length; index += 100) {
        const slice = ids.slice(index, index + 100);
        const { data, error } = await supabase.from("user_now_playing").select("user_id,track,art_url,display,updated_at").in("user_id", slice);
        if (cancelled || error) return;
        rows.push(...(data ?? []));
      }
      const next: Record<string, ListeningActivity> = {};
      for (const row of rows) {
        if (row.display === "profile" || !isFreshActivity(row.updated_at) || !row.track) continue;
        next[row.user_id] = { track: row.track, artUrl: safeSpotifyArtUrl(row.art_url) };
      }
      if (!cancelled) setActivities(next);
    }
    void load();
    const channel = supabase.channel("sekai-member-listening")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_now_playing" }, () => { void load(); })
      .subscribe();
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [key]);
  return activities;
}

export function ListeningLine({ track, artUrl }: ListeningActivity) {
  const art = safeSpotifyArtUrl(artUrl);
  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium leading-[14px] tracking-[-0.006em] text-[#b5bac1]">
      {art ? <img src={art} alt="" className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-cover" /> : <SpotifyMark className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 truncate">Escutando {track}</span>
    </span>
  );
}

export type GameActivity = { gameId: string; gameName: string; gameIconUrl?: string | null; startedAt: string; updatedAt: string };

function safeGameIconUrl(value: string | null | undefined) {
  const icon = String(value || "");
  if (icon.length > 500_000) return "";
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(icon)) return icon;
  try {
    const url = new URL(icon);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function loadGameActivity(supabase: ReturnType<typeof createClient>, userId: string) {
  const withIcon = await supabase.from("user_game_activity").select("game_id,game_name,game_icon_url,started_at,updated_at").eq("user_id", userId).maybeSingle();
  if (!withIcon.error) return withIcon.data as { game_id: string; game_name: string; game_icon_url?: string | null; started_at: string; updated_at: string } | null;
  if (!String(withIcon.error.message || "").toLowerCase().includes("game_icon_url")) return null;
  const legacy = await supabase.from("user_game_activity").select("game_id,game_name,started_at,updated_at").eq("user_id", userId).maybeSingle();
  return !legacy.error && legacy.data ? { ...legacy.data, game_icon_url: null } as { game_id: string; game_name: string; game_icon_url: null; started_at: string; updated_at: string } : null;
}

function isFreshGameActivity(updatedAt: string) {
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp < 45_000;
}

export function useGameActivity(userId: string, status: string) {
  const [activity, setActivity] = useState<GameActivity | null>(null);
  useEffect(() => {
    if (!userId || status === "offline") { setActivity(null); return; }
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const data = await loadGameActivity(supabase, userId);
      if (cancelled) return;
      if (!data || !isFreshGameActivity(data.updated_at)) { setActivity(null); return; }
      setActivity({ gameId: data.game_id, gameName: data.game_name, gameIconUrl: safeGameIconUrl(data.game_icon_url), startedAt: data.started_at, updatedAt: data.updated_at });
    }
    void load();
    const channel = supabase.channel(`game-activity-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_game_activity", filter: `user_id=eq.${userId}` }, () => { void load(); })
      .subscribe();
    const timer = window.setInterval(() => void load(), 12_000);
    return () => { cancelled = true; window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [status, userId]);
  return status === "offline" ? null : activity;
}

export function useGameActivityByUser(userIds: string[]) {
  const key = userIds.slice().sort().join(",");
  const [activities, setActivities] = useState<Record<string, GameActivity>>({});
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) { setActivities({}); return; }
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const rows: Array<{ user_id: string; game_id: string; game_name: string; game_icon_url?: string | null; started_at: string; updated_at: string }> = [];
      for (let index = 0; index < ids.length; index += 100) {
        let { data, error } = await supabase.from("user_game_activity").select("user_id,game_id,game_name,game_icon_url,started_at,updated_at").in("user_id", ids.slice(index, index + 100));
        if (error && String(error.message || "").toLowerCase().includes("game_icon_url")) {
          const legacy = await supabase.from("user_game_activity").select("user_id,game_id,game_name,started_at,updated_at").in("user_id", ids.slice(index, index + 100));
          data = legacy.data as typeof data;
          error = legacy.error;
        }
        if (cancelled || error) return;
        rows.push(...((data ?? []) as typeof rows));
      }
      const next: Record<string, GameActivity> = {};
      for (const row of rows) if (isFreshGameActivity(row.updated_at) && row.game_name) next[row.user_id] = { gameId: row.game_id, gameName: row.game_name, gameIconUrl: safeGameIconUrl(row.game_icon_url), startedAt: row.started_at, updatedAt: row.updated_at };
      if (!cancelled) setActivities(next);
    }
    void load();
    const channel = supabase.channel("sekai-member-game-activity")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_game_activity" }, () => { void load(); })
      .subscribe();
    const timer = window.setInterval(() => void load(), 12_000);
    return () => { cancelled = true; window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [key]);
  return activities;
}

export function GameActivityLine({ activity }: { activity: GameActivity }) {
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(activity.startedAt)) / 1000));
  return <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium leading-[14px] tracking-[-0.006em] text-[#b5bac1]">{activity.gameIconUrl ? <img src={activity.gameIconUrl} alt={`${activity.gameName} ícone`} className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-cover"/> : <span aria-label={`Ícone de ${activity.gameName} indisponível`} className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] bg-white/10 text-[9px] font-bold text-emerald-300">{activity.gameName.trim().slice(0, 1).toLocaleUpperCase()}</span>}<span className="min-w-0 truncate">Jogando {activity.gameName} · {formatElapsed(elapsed)}</span></span>;
}

export function GameActivityCard({ activity }: { activity: GameActivity }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const elapsed = Math.max(0, Math.floor((now - Date.parse(activity.startedAt)) / 1000));
  return <div className="mt-3 flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-[#1a1a1d] p-3">
    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-emerald-400/10 text-emerald-100">{activity.gameIconUrl ? <img src={activity.gameIconUrl} alt={`${activity.gameName} ícone`} className="h-full w-full object-cover"/> : <span className="text-lg font-bold">{activity.gameName.trim().slice(0, 1).toLocaleUpperCase()}</span>}</span>
    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-300"><Gamepad2 className="h-3.5 w-3.5"/>Jogando</span><span className="mt-0.5 block truncate text-sm font-semibold text-white">{activity.gameName}</span><span className="mt-0.5 block text-xs text-white/60">Há {formatElapsed(elapsed)}</span></span>
  </div>;
}

function formatElapsed(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}`;
}

export function useConnections(userId: string, includeLocal: boolean) {
  const [connections, setConnections] = useState<PublicConnection[]>([]);
  useEffect(() => {
    if (!userId) { setConnections([]); return; }
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const { data, error } = await supabase.from("user_connections").select("provider,display_name,profile_url").eq("user_id", userId);
      const remote: PublicConnection[] = !error && data
        ? data.flatMap((row) => row.provider === "spotify" ? [{
          provider: "spotify" as const,
          displayName: String(row.display_name || "Spotify"),
          profileUrl: safeSpotifyProfileUrl(row.profile_url),
        }] : [])
        : [];
      const local = includeLocal ? readSpotifySession(userId) : null;
      const next = remote.length
        ? remote
        : local
          ? [{ provider: "spotify" as const, displayName: local.displayName, profileUrl: safeSpotifyProfileUrl(local.profileUrl) }]
          : [];
      if (!cancelled) setConnections(next);
    }
    void load();
    const channel = supabase.channel(`sekai-connections-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_connections", filter: `user_id=eq.${userId}` }, () => { void load(); })
      .subscribe();
    const onSession = () => { if (includeLocal) void load(); };
    window.addEventListener("sekai-spotify-session", onSession);
    return () => {
      cancelled = true;
      window.removeEventListener("sekai-spotify-session", onSession);
      void supabase.removeChannel(channel);
    };
  }, [includeLocal, userId]);
  return connections;
}

export function ProfileConnections({ connections, showAdd }: { connections: PublicConnection[]; showAdd?: boolean }) {
  if (!connections.length && !showAdd) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-discord-text-muted">Conexões</p>
      <div className="space-y-0.5">
        {connections.map((connection) => {
          const body = (
            <>
              <SpotifyMark className="h-6 w-6 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-discord-header-primary">{connection.displayName}</span>
              {connection.profileUrl && <ArrowUpRight className="h-4 w-4 shrink-0 text-discord-text-muted" />}
            </>
          );
          const className = "flex min-w-0 items-center gap-2 rounded px-1 py-1 no-underline transition hover:bg-white/[0.04]";
          return connection.profileUrl
            ? <a key={connection.provider} href={connection.profileUrl} target="_blank" rel="noreferrer" className={className}>{body}</a>
            : <div key={connection.provider} className={className}>{body}</div>;
        })}
      </div>
      {showAdd && (
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("sekai:open-settings", { detail: "conexoes" }))} className="mt-1 px-1 text-left text-sm font-medium text-discord-text-muted transition hover:text-discord-text-normal">
          + Adicionar conexão
        </button>
      )}
    </div>
  );
}
