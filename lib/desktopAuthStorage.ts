const CHUNK = 1200;

export type DesktopAuthStore = {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<boolean> | boolean;
  remove(key: string): Promise<boolean> | boolean;
};

type CookieJar = {
  read(): string;
  write(line: string): void;
};

function hashKey(key: string) {
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) hash = ((hash * 33) ^ key.charCodeAt(index)) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

function cookieName(id: string, index: number) {
  return `sa_${id}_${index}`;
}

function readPairs(header: string) {
  const pairs = new Map<string, string>();
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    pairs.set(trimmed.slice(0, eq), decodeURIComponent(trimmed.slice(eq + 1)));
  }
  return pairs;
}

function browserWindow() {
  if (typeof globalThis === "undefined") return null;
  const candidate = (globalThis as { window?: Window }).window ?? (typeof window === "undefined" ? null : window);
  return candidate ?? null;
}

function legacyValue(key: string) {
  try {
    return browserWindow()?.localStorage.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function mirrorLegacy(key: string, value: string | null) {
  try {
    const storage = browserWindow()?.localStorage;
    if (!storage) return;
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // O arquivo ou o cookie continua sendo a cópia que sobrevive ao fechar o app.
  }
}

export function createCookieAuthStorage(jar: CookieJar) {
  const removeItem = (key: string) => {
    const pairs = readPairs(jar.read());
    const id = hashKey(key);
    const count = Number(pairs.get(cookieName(id, -1)));
    const total = Number.isInteger(count) && count > 0 ? count : 8;
    jar.write(`${cookieName(id, -1)}=; Max-Age=0; Path=/; SameSite=Lax`);
    for (let index = 0; index < total; index += 1) jar.write(`${cookieName(id, index)}=; Max-Age=0; Path=/; SameSite=Lax`);
  };
  return {
    getItem(key: string) {
      const pairs = readPairs(jar.read());
      const id = hashKey(key);
      const count = Number(pairs.get(cookieName(id, -1)));
      if (!Number.isInteger(count) || count <= 0) return null;
      let payload = "";
      for (let index = 0; index < count; index += 1) {
        const chunk = pairs.get(cookieName(id, index));
        if (chunk == null) return null;
        payload += chunk;
      }
      const split = payload.indexOf("\n");
      if (split < 0 || payload.slice(0, split) !== key) return null;
      return payload.slice(split + 1);
    },
    setItem(key: string, value: string) {
      const payload = `${key}\n${value}`;
      const id = hashKey(key);
      const count = Math.ceil(payload.length / CHUNK) || 1;
      removeItem(key);
      for (let index = 0; index < count; index += 1) {
        const chunk = payload.slice(index * CHUNK, (index + 1) * CHUNK);
        jar.write(`${cookieName(id, index)}=${encodeURIComponent(chunk)}; Max-Age=2592000; Path=/; SameSite=Lax`);
      }
      jar.write(`${cookieName(id, -1)}=${count}; Max-Age=2592000; Path=/; SameSite=Lax`);
    },
    removeItem,
  };
}

export function createFileAuthStorage(store: DesktopAuthStore) {
  return {
    async getItem(key: string) {
      try {
        const saved = await store.get(key);
        if (typeof saved === "string") return saved;
      } catch {
        // O arquivo ainda não existe nesta versão do aplicativo.
      }
      const legacy = legacyValue(key);
      if (legacy != null) {
        try { await store.set(key, legacy); } catch { /* A próxima gravação tenta de novo. */ }
        return legacy;
      }
      return null;
    },
    async setItem(key: string, value: string) {
      try { await store.set(key, value); } catch { /* O espelho local ainda recebe a sessão. */ }
      mirrorLegacy(key, value);
    },
    async removeItem(key: string) {
      try { await store.remove(key); } catch { /* A remoção local segue abaixo. */ }
      mirrorLegacy(key, null);
    },
  };
}

export function browserCookieJar(): CookieJar {
  return {
    read: () => document.cookie,
    write: (line) => {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${line}${secure}`;
    },
  };
}

/** No aplicativo, a sessão fica fora do localStorage, que o Electron descartava ao fechar. */
export function desktopAuthStorage() {
  if (typeof window === "undefined" || !window.sekaiDesktop) return null;
  const file = window.sekaiDesktop.authStore;
  if (file) return createFileAuthStorage(file);
  return {
    getItem: (key: string) => {
      const stored = createCookieAuthStorage(browserCookieJar()).getItem(key);
      if (stored != null) return stored;
      const legacy = legacyValue(key);
      if (legacy != null) createCookieAuthStorage(browserCookieJar()).setItem(key, legacy);
      return legacy;
    },
    setItem: (key: string, value: string) => {
      createCookieAuthStorage(browserCookieJar()).setItem(key, value);
      mirrorLegacy(key, value);
    },
    removeItem: (key: string) => {
      createCookieAuthStorage(browserCookieJar()).removeItem(key);
      mirrorLegacy(key, null);
    },
  };
}
