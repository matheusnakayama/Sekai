import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeChatMarkdownUrl } from "../lib/chatMarkdownUrl.ts";
import { scriptSourceDirective } from "../lib/contentSecurityPolicy.ts";

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

test("chat markdown disables raw HTML and validates every link and image destination", () => {
  const source = readFileSync(resolve(root, "components/ChatMessageBody.tsx"), "utf8");
  assert.match(source, /skipHtml/);
  assert.match(source, /urlTransform=\{\(url\) => safeChatMarkdownUrl\(url\)\}/);
  assert.match(source, /const safeHref = safeChatMarkdownUrl\(href \?\? ""\)/);
});

test("login does not depend on the redirect origin while signup and recovery do", () => {
  const page = readFileSync(resolve(root, "app/page.tsx"), "utf8");
  assert.match(page, /if \(mode !== "login" && !siteUrl\)/);
  assert.match(page, /disabled=\{loading \|\| Boolean\(success\) \|\| !captchaToken \|\| \(mode !== "login" && !siteUrl\)\}/);
  assert.match(page, /if \(loginError\) setError\("E-mail ou senha inválidos\."\)/);
});

test("soundboard cleanup does not recursively remove a channel after CLOSED", () => {
  const page = readFileSync(resolve(root, "app/page.tsx"), "utf8");
  const start = page.indexOf('channel.subscribe((status, error) => {');
  const end = page.indexOf("\n    });", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const handler = page.slice(start, end);
  assert.match(handler, /if \(status !== "CLOSED" && !cleanupStarted\)/);
  assert.match(handler, /cleanupStarted = true;\s*queueMicrotask\(\(\) => void supabase\.removeChannel\(channel\)\)/);
  assert.doesNotMatch(handler, /if \(status === "CHANNEL_ERROR" \|\| status === "TIMED_OUT" \|\| status === "CLOSED"\)[\s\S]*?void supabase\.removeChannel\(channel\);\s*\}/);
});

test("Electron windows keep renderer sandboxing enabled", () => {
  const main = readFileSync(resolve(root, "desktop/main.cjs"), "utf8");
  assert.equal((main.match(/sandbox: true/g) ?? []).length, 3);
  assert.doesNotMatch(main, /sandbox:\s*false/);
});

test("theme initialization is same-origin external JavaScript without a nonce mismatch", () => {
  const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
  const themeRoute = readFileSync(resolve(root, "app/theme-init.js/route.ts"), "utf8");
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /<Script src="\/theme-init\.js" strategy="beforeInteractive" \/>/);
  assert.doesNotMatch(layout, /dangerouslySetInnerHTML|nonce=/);
  assert.match(themeRoute, /Content-Type": "application\/javascript/);
});

test("script-src permits WebAssembly in production and JavaScript eval only in development", () => {
  const production = scriptSourceDirective("test-nonce", false);
  const development = scriptSourceDirective("test-nonce", true);
  assert.doesNotMatch(production, /'unsafe-inline'|'unsafe-eval'/);
  assert.match(production, /'wasm-unsafe-eval'/);
  assert.match(development, /'unsafe-eval'/);
  assert.doesNotMatch(development, /unsafe-inline/);
});

test("platform admins only see their memberships/owned servers and cannot open another by URL", () => {
  const page = readFileSync(resolve(root, "app/page.tsx"), "utf8");
  const loadServersStart = page.indexOf("async function loadServers() {");
  const loadServersEnd = page.indexOf("async function openRequestedChannelOrDefaultServer", loadServersStart);
  assert.notEqual(loadServersStart, -1);
  assert.notEqual(loadServersEnd, -1);
  const loadServers = page.slice(loadServersStart, loadServersEnd);

  assert.match(loadServers, /from\("members"\)[\s\S]*?\.eq\("user_id", currentUserId\)/);
  assert.match(loadServers, /\.eq\("is_banned", false\)/);
  assert.match(loadServers, /\.eq\("owner_id", currentUserId\)/);
  assert.doesNotMatch(loadServers, /if\s*\(isPlatformAdmin\)/);
  assert.doesNotMatch(page, /localStorage\.getItem\(`sekai-server-list:/);
  assert.match(page, /if \(channel && list\.some\(\(server\) => server\.id === channel\.server_id\)\)/);
});

test("Pusher room authorization validates identity, signed room, and current DM relationship", () => {
  const source = readFileSync(resolve(root, "app/api/pusher/auth/route.ts"), "utf8");
  assert.match(source, /verifyRoomSession\(roomId, userId, roomSession/);
  assert.match(source, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(source, /channelName !== `presence-room-\$\{roomId\}`/);
  assert.match(source, /status', 'accepted'/);
  assert.match(source, /sharesServer/);
});

test("Spotify OAuth uses state and PKCE while token persistence risk stays explicit", () => {
  const source = readFileSync(resolve(root, "lib/spotify.ts"), "utf8");
  assert.match(source, /code_challenge_method", "S256"/);
  assert.match(source, /code_verifier: verifier/);
  assert.match(source, /expectedState !== returnedState/);
  assert.match(source, /localStorage\.setItem\(storageKey\(userId\)/);
});

test("Blob uploads enforce server-side signature verification, MIME, size, and room presence", () => {
  const source = readFileSync(resolve(root, "app/api/chat-images/upload/route.ts"), "utf8");
  assert.match(source, /handleUploadPresigned\(/);
  assert.match(source, /BLOB_WEBHOOK_PUBLIC_KEY/);
  assert.match(source, /allowedContentTypes: ALLOWED_IMAGE_TYPES/);
  assert.match(source, /maximumSizeInBytes: MAX_IMAGE_SIZE/);
  assert.match(source, /presenceBody\.users\?\.some/);
});

test("the production SQL snapshot still contains the 38-function review baseline", () => {
  const schema = readFileSync(resolve(root, "db/schema-atual-producao.sql"), "utf8");
  const count = (schema.match(/SECURITY DEFINER/gi) ?? []).length;
  assert.equal(count, 38);
});

test("the function migration hardens every public SECURITY DEFINER and preserves intended RPCs", () => {
  const schema = readFileSync(resolve(root, "db/schema-atual-producao.sql"), "utf8");
  const migrationsDir = resolve(root, "supabase/migrations");
  const functions = readFileSync(resolve(migrationsDir, "20261012000300_rls_functions_pending_PENDENTE_APROVACAO.sql"), "utf8");
  assert.match(functions, /alter function %s set search_path = pg_catalog, public, auth, extensions, storage, realtime, pg_temp/);
  assert.match(functions, /p\.prosecdef and p\.prokind = 'f'/);
  assert.match(functions, /revoke execute on function %s from public, anon/);
  assert.match(functions, /grant execute on function public\.moderate_server_member\(uuid, uuid, text, text\) to authenticated/);
  assert.match(functions, /grant execute on function public\.redeem_invite\(text\) to authenticated/);
  assert.match(functions, /using \(auth\.uid\(\) = user_id or \(auth\.uid\(\) is not null and \(visible_in_profile or visible_in_member_list\)\)\)/);
  const functionDefinitions = (schema.match(/SECURITY DEFINER/gi) ?? []).length;
  assert.equal(functionDefinitions, 38);
});

test("every USING (true) policy in the reference snapshot has a named restrictive replacement", () => {
  const schema = readFileSync(resolve(root, "db/schema-atual-producao.sql"), "utf8");
  const functions = readFileSync(resolve(root, "supabase/migrations/20261012000300_rls_functions_pending_PENDENTE_APROVACAO.sql"), "utf8");
  const matches = [...schema.matchAll(/CREATE POLICY\s+"([^"]+)"[^;]*?USING\s*\(true\)/gim)];
  assert.equal(matches.length, 6);
  for (const [, policy] of matches) {
    assert.match(functions, new RegExp(`drop policy if exists ${policy} on public\\.`));
  }
  assert.match(functions, /messages_block_system_marker_update on public\.messages as restrictive[\s\S]*using \(author_id = auth\.uid\(\)/);
});

test("authorization, invite, and storage migrations remain pending and bound inputs", () => {
  const migrationsDir = resolve(root, "supabase/migrations");
  const authz = readFileSync(resolve(migrationsDir, "20261012000200_authorization_invites_PENDENTE_APROVACAO.sql"), "utf8");
  const functions = readFileSync(resolve(migrationsDir, "20261012000300_rls_functions_pending_PENDENTE_APROVACAO.sql"), "utf8");
  const storage = readFileSync(resolve(migrationsDir, "20261012000400_storage_realtime_chat_PENDENTE_APROVACAO.sql"), "utf8");
  assert.match(authz, /for update to authenticated[\s\S]*sekai_can_update_role/);
  assert.match(authz, /least\(public\.sekai_invite_attempts\.attempts \+ 1, 11\)/);
  assert.match(authz, /create unique index if not exists invites_normalized_code_unique_idx/);
  assert.match(authz, /deduplique-os antes de aplicar a migration/);
  assert.match(authz, /for update[\s\S]*invites[\s\S]*uses = coalesce\(i\.uses, 0\) \+ 1/);
  assert.match(authz, /guild_bans b where b\.server_id = v_server_id and b\.user_id = v_user_id/);
  assert.match(functions, /set search_path = pg_catalog, public, auth, pg_temp/);
  for (const bucket of ["avatars", "banners", "server-icons", "server-assets", "chat-images"]) {
    assert.ok(storage.includes(`'${bucket}'`), `storage bucket ${bucket} must be present`);
  }
  assert.match(storage, /allowed_mime_types/);
  assert.match(storage, /file_size_limit/);
  assert.match(storage, /\(svg\|svgz\|html\?\|xhtml\)/);
  assert.ok(storage.indexOf("create or replace function public.sekai_can_access_chat_image") < storage.indexOf("create policy sekai_chat_images_read"));
  assert.match(storage, /char_length\(coalesce\(p_name, ''\)\) > 1024/);
  assert.match(storage, /interval '10 seconds'/);
  for (const migration of [authz, functions, storage]) assert.match(migration, /PENDENTE DE APROVACAO/i);
});
