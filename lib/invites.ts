const INVITE_CODE = /^[A-Za-z0-9]{6,16}$/;
const RESERVED_CODES = new Set(["spotify", "api", "auth", "login", "invite", "convite"]);

const INVITE_HOSTS = new Set([
  "murasakidev.com.br",
  "www.murasakidev.com.br",
  "localhost",
  "127.0.0.1",
]);

export function isInviteCode(value: string) {
  return INVITE_CODE.test(value) && !RESERVED_CODES.has(value.toLowerCase());
}

export function inviteUrl(code: string, origin?: string) {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "https://murasakidev.com.br")).replace(/\/$/, "");
  return `${base}/${code}`;
}

/** Lê o código de um link curto (/Ab12Cd34) ou do formato antigo (?invite=). */
export function inviteCodeFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!INVITE_HOSTS.has(host) && !host.endsWith(".murasakidev.com.br")) return null;
    const fromQuery = url.searchParams.get("invite") || url.searchParams.get("code");
    if (fromQuery && isInviteCode(fromQuery.trim())) return fromQuery.trim();
    const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (segments.length === 1 && isInviteCode(segments[0])) return segments[0];
    return null;
  } catch {
    return null;
  }
}
