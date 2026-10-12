import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeChatMarkdownUrl } from "../lib/chatMarkdownUrl.ts";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));

test("Markdown accepts HTTPS and the app mention anchors", () => {
  assert.equal(safeChatMarkdownUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(safeChatMarkdownUrl("#sekai-mention"), "#sekai-mention");
  assert.equal(safeChatMarkdownUrl("#sekai-mention-mine"), "#sekai-mention-mine");
});

test("Markdown rejects executable, data, and non-TLS URL schemes", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "http://example.com/",
  ]) {
    assert.equal(safeChatMarkdownUrl(value), "", value);
  }
});

test("the production SQL snapshot still contains the 38-function review baseline", () => {
  const schema = readFileSync(resolve(root, "db/schema-atual-producao.sql"), "utf8");
  const count = (schema.match(/SECURITY DEFINER/gi) ?? []).length;
  assert.equal(count, 38);
});

test("all new production SQL migrations stay explicitly pending approval", () => {
  const migrationsDir = resolve(root, "supabase/migrations");
  const authz = readFileSync(resolve(migrationsDir, "20261012000200_authorization_invites_PENDENTE_APROVACAO.sql"), "utf8");
  const functions = readFileSync(resolve(migrationsDir, "20261012000300_rls_functions_pending_PENDENTE_APROVACAO.sql"), "utf8");
  const storage = readFileSync(resolve(migrationsDir, "20261012000400_storage_realtime_chat_PENDENTE_APROVACAO.sql"), "utf8");
  assert.match(authz, /for update to authenticated[\s\S]*sekai_can_update_role/);
  assert.match(authz, /attempts > 10/);
  assert.match(functions, /revoke execute on function %s from public, anon/);
  assert.match(functions, /drop function if exists public\.is_server_member\(uuid, uuid\) restrict/);
  for (const bucket of ["avatars", "banners", "server-icons", "server-assets", "chat-images"]) {
    assert.ok(storage.includes(`'${bucket}'`), `storage bucket ${bucket} must be present`);
  }
  assert.match(storage, /interval '10 seconds'/);
});
