import { NextResponse, type NextRequest } from "next/server";
import { scriptSourceDirective } from "@/lib/contentSecurityPolicy";

function validOrigin(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname) ? url.origin : "";
  } catch {
    return "";
  }
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const supabaseOrigin = validOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const liveKitValue = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
  let liveKitOrigin = "";
  try {
    const liveKitUrl = new URL(liveKitValue);
    if (liveKitUrl.protocol === "wss:") liveKitOrigin = `https://${liveKitUrl.host}`;
    else if (liveKitUrl.protocol === "https:" || (liveKitUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(liveKitUrl.hostname))) liveKitOrigin = liveKitUrl.origin;
  } catch {
    // URL ausente ou inválida: essa origem não entra na política.
  }
  const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^https:/, "wss:").replace(/^http:/, "ws:") : "";
  const liveKitWs = liveKitOrigin ? liveKitOrigin.replace(/^https:/, "wss:") : "";
  const development = process.env.NODE_ENV !== "production";
  const connectSources = [
    "'self'",
    supabaseOrigin,
    supabaseWs,
    liveKitOrigin,
    liveKitWs,
    "https://*.pusher.com",
    "wss://*.pusher.com",
    "https://*.pusherapp.com",
    "wss://*.pusherapp.com",
    "https://api.spotify.com",
    "https://accounts.spotify.com",
    "https://challenges.cloudflare.com",
  ].filter(Boolean);
  const directives = [
    "default-src 'self'",
    scriptSourceDirective(nonce, development),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'self' data: blob: https:",
    "frame-src 'self' https://challenges.cloudflare.com https://www.tiktok.com https://www.instagram.com https://www.youtube.com https://www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ];
  const contentSecurityPolicy = directives.join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");
  if (!development) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
