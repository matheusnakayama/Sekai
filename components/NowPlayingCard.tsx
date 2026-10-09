"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isFreshActivity, type NowPlaying } from "@/lib/spotify";

function SpotifyMark({ className }: { className?: string }) {
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
        {activity.artUrl ? <img src={activity.artUrl} alt="" className="h-full w-full object-cover" /> : <SpotifyMark className="h-full w-full p-2" />}
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
