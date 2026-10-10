"use client";

import { createClient } from "@/lib/supabase/client";

export const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = "user-read-currently-playing user-read-playback-state";
const VERIFIER_KEY = "sekai-spotify-verifier";

export type SpotifySession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  displayName: string;
  profileUrl: string;
  showOnProfile: boolean;
  showAsStatus: boolean;
};

export type PublicConnection = {
  provider: "spotify";
  displayName: string;
  profileUrl: string;
};

export type NowPlaying = {
  track: string;
  artist: string;
  album: string;
  artUrl: string;
  trackUrl: string;
  display: "profile" | "status" | "both";
  updatedAt: string;
};

function storageKey(userId: string) {
  return `sekai-spotify:${userId}`;
}

export function spotifyRedirectUri() {
  return `${window.location.origin}/spotify/callback`;
}

export function readSpotifySession(userId: string): SpotifySession | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(userId)) || "null");
    if (!value?.accessToken || !value?.refreshToken) return null;
    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: Number(value.expiresAt) || 0,
      displayName: String(value.displayName || "Spotify"),
      profileUrl: safeSpotifyProfileUrl(value.profileUrl),
      showOnProfile: value.showOnProfile !== false,
      showAsStatus: value.showAsStatus !== false,
    };
  } catch {
    return null;
  }
}

export function writeSpotifySession(userId: string, session: SpotifySession | null) {
  if (!session) localStorage.removeItem(storageKey(userId));
  else localStorage.setItem(storageKey(userId), JSON.stringify(session));
  window.dispatchEvent(new Event("sekai-spotify-session"));
}

function randomVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function beginSpotifyConnect() {
  if (!SPOTIFY_CLIENT_ID) throw new Error("O Spotify ainda não foi configurado neste Sekai.");
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await codeChallenge(verifier);
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", spotifyRedirectUri());
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  window.location.assign(url.toString());
}

export async function finishSpotifyConnect(code: string) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier || !SPOTIFY_CLIENT_ID) throw new Error("A conexão expirou. Abra Conexões e tente de novo.");
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirectUri(),
    code_verifier: verifier,
  });
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("O Spotify não confirmou a conexão.");
  const token = await response.json();
  const account = await spotifyAccount(token.access_token as string);
  return {
    accessToken: token.access_token as string,
    refreshToken: token.refresh_token as string,
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
    displayName: account?.displayName || "Spotify",
    profileUrl: account?.profileUrl || "",
    showOnProfile: true,
    showAsStatus: true,
  } satisfies SpotifySession;
}

export async function spotifyAccount(accessToken: string) {
  const profile = await fetch("https://api.spotify.com/v1/me", { headers: { authorization: `Bearer ${accessToken}` } });
  if (!profile.ok) return null;
  const me = await profile.json();
  return {
    displayName: String(me.display_name || me.id || "Spotify").slice(0, 80),
    profileUrl: spotifyProfileUrl(me),
  };
}

function spotifyProfileUrl(me: { id?: string; external_urls?: { spotify?: string } }) {
  return safeSpotifyProfileUrl(me.external_urls?.spotify)
    || (me.id && /^[A-Za-z0-9]+$/.test(me.id) ? `https://open.spotify.com/user/${me.id}` : "");
}

export function safeSpotifyProfileUrl(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com" || !url.pathname.startsWith("/user/")) return "";
    return url.toString().slice(0, 200);
  } catch {
    return "";
  }
}

export function safeSpotifyArtUrl(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "i.scdn.co") return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function refreshAccessToken(session: SpotifySession) {
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("Não foi possível renovar o Spotify.");
  const token = await response.json();
  return {
    ...session,
    accessToken: token.access_token as string,
    refreshToken: (token.refresh_token as string) || session.refreshToken,
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
  } satisfies SpotifySession;
}

export async function ensureSpotifyToken(userId: string) {
  const session = readSpotifySession(userId);
  if (!session) return null;
  if (session.expiresAt > Date.now() + 30_000) return session;
  const next = await refreshAccessToken(session);
  writeSpotifySession(userId, next);
  return next;
}

export async function fetchCurrentlyPlaying(accessToken: string) {
  const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 204 || response.status === 202) return null;
  if (!response.ok) throw new Error("O Spotify não informou a faixa atual.");
  const payload = await response.json();
  const track = payload?.item;
  if (!payload?.is_playing || !track?.name) return null;
  const images = track.album?.images ?? [];
  return {
    track: String(track.name).slice(0, 120),
    artist: (track.artists ?? []).map((artist: { name?: string }) => artist.name).filter(Boolean).join(", ").slice(0, 160),
    album: String(track.album?.name || "").slice(0, 120),
    artUrl: String(images[1]?.url || images[0]?.url || ""),
    trackUrl: String(track.external_urls?.spotify || ""),
  };
}

export function displayMode(session: SpotifySession): NowPlaying["display"] {
  if (session.showOnProfile && session.showAsStatus) return "both";
  if (session.showAsStatus) return "status";
  return "profile";
}

export async function publishNowPlaying(userId: string, playing: Omit<NowPlaying, "display" | "updatedAt">, display: NowPlaying["display"]) {
  const supabase = createClient();
  const { error } = await supabase.from("user_now_playing").upsert({
    user_id: userId,
    provider: "spotify",
    track: playing.track,
    artist: playing.artist,
    album: playing.album,
    art_url: playing.artUrl || null,
    track_url: playing.trackUrl || null,
    display,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function clearNowPlaying(userId: string) {
  const supabase = createClient();
  await supabase.from("user_now_playing").delete().eq("user_id", userId);
}

export async function publishConnection(userId: string, connection: { displayName: string; profileUrl: string }) {
  const supabase = createClient();
  const { error } = await supabase.from("user_connections").upsert({
    user_id: userId,
    provider: "spotify",
    display_name: connection.displayName.slice(0, 80) || "Spotify",
    profile_url: safeSpotifyProfileUrl(connection.profileUrl) || null,
  }, { onConflict: "user_id,provider" });
  if (error) throw error;
}

export async function clearConnection(userId: string) {
  const supabase = createClient();
  await supabase.from("user_connections").delete().eq("user_id", userId).eq("provider", "spotify");
}

export function isFreshActivity(updatedAt: string) {
  return Date.now() - new Date(updatedAt).getTime() < 75_000;
}
