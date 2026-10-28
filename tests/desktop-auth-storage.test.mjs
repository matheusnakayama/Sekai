import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { createCookieAuthStorage, createFileAuthStorage } from "../lib/desktopAuthStorage.ts";

const require = createRequire(import.meta.url);
const { createAuthSessionFile } = require("../desktop/authSessionFile.cjs");

function memoryJar() {
  const cookies = new Map();
  return {
    read: () => [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
    write(line) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const expires = /Max-Age=0/.test(line);
      if (expires) cookies.delete(name);
      else cookies.set(name, pair.slice(eq + 1));
    },
  };
}

test("desktop cookies keep a long supabase session and drop it on sign-out", () => {
  const storage = createCookieAuthStorage(memoryJar());
  const key = "sb-projectref-auth-token";
  const value = `refresh.${"a".repeat(5000)}.token`;
  storage.setItem(key, value);
  assert.equal(storage.getItem(key), value);
  assert.equal(storage.getItem("sb-other-auth-token"), null);
  storage.removeItem(key);
  assert.equal(storage.getItem(key), null);
});

test("the desktop auth file survives a new reader and rejects other keys", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "sekai-auth-")), "auth-session.json");
  const first = createAuthSessionFile(file);
  const key = "sb-projectref-auth-token";
  assert.equal(first.set(key, "{\"refresh_token\":\"abc\"}"), true);
  assert.equal(first.set("theme", "dark"), false);
  const second = createAuthSessionFile(file);
  assert.equal(second.get(key), "{\"refresh_token\":\"abc\"}");
  assert.equal(second.remove(key), true);
  assert.equal(second.get(key), null);
  assert.match(readFileSync(file, "utf8"), /\{\}/);
});

test("file storage copies a legacy local session once", async () => {
  const saved = new Map();
  const storage = createFileAuthStorage({
    get: async (key) => saved.get(key) ?? null,
    set: async (key, value) => { saved.set(key, value); return true; },
    remove: async (key) => { saved.delete(key); return true; },
  });
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => "{\"access_token\":\"legacy\"}", setItem() {}, removeItem() {} } };
  try {
    assert.equal(await storage.getItem("sb-projectref-auth-token"), "{\"access_token\":\"legacy\"}");
    assert.equal(saved.get("sb-projectref-auth-token"), "{\"access_token\":\"legacy\"}");
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
