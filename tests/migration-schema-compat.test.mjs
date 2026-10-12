import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const snapshot = readFileSync(resolve(root, "db/schema-atual-producao.sql"), "utf8");
const migrationsDir = resolve(root, "supabase/migrations");
const migrationFiles = [
  "20261012000200_authorization_invites_PENDENTE_APROVACAO.sql",
  "20261012000300_rls_functions_pending_PENDENTE_APROVACAO.sql",
  "20261012000400_storage_realtime_chat_PENDENTE_APROVACAO.sql",
];
const migrations = migrationFiles.map((file) => readFileSync(resolve(migrationsDir, file), "utf8"));

function snapshotTables(sql) {
  const tables = new Map();
  const tablePattern = /CREATE TABLE IF NOT EXISTS "public"\."([^\"]+)"\s*\(([\s\S]*?)\n\);/g;
  for (const match of sql.matchAll(tablePattern)) {
    const columns = new Set();
    for (const columnMatch of match[2].matchAll(/^\s+"([^\"]+)"\s+/gm)) columns.add(columnMatch[1]);
    tables.set(match[1], columns);
  }
  return tables;
}

const tables = snapshotTables(snapshot);

test("the reviewed migration column manifest exists in the production snapshot or is migration-owned", () => {
  const migrationOwned = new Map([
    ["guild_bans", new Set(["target_role_position"])],
    ["guild_timeouts", new Set(["server_id", "user_id", "executor_id", "until_at", "target_role_position", "created_at"])],
    ["sekai_moderation_dispatches", new Set(["id", "server_id", "target_id", "actor_id", "action", "created_at"])],
    ["sekai_invite_attempts", new Set(["user_id", "window_started_at", "attempts"])],
  ]);
  const referencedColumns = {
    servers: ["id", "name", "icon_url", "banner_url", "created_at", "owner_id"],
    profiles: ["id", "display_name", "username", "status"],
    members: ["server_id", "user_id", "role_id", "communication_disabled_until", "nickname", "is_banned", "is_muted", "avatar_url", "banner_url", "avatar_position_x", "avatar_position_y", "avatar_zoom", "banner_position_x", "banner_position_y", "banner_zoom", "member_list_banner_url", "member_list_banner_position_x", "member_list_banner_position_y", "member_list_banner_zoom"],
    roles: ["id", "server_id", "name", "color", "hoist", "mentionable", "is_default", "position", "permissions", "icon_url", "insignia_url"],
    member_roles: ["server_id", "user_id", "role_id"],
    guild_bans: ["server_id", "user_id", "executor_id", "reason", "created_at", "target_role_position"],
    invites: ["code", "server_id", "channel_id", "inviter_id", "uses", "max_uses", "max_age", "created_at", "expires_at"],
    server_audit_logs: ["server_id", "actor_id", "action", "target", "details"],
    channels: ["id", "server_id", "type"],
    channel_permission_overwrites: ["channel_id", "target_type", "target_id", "allow_permissions", "deny_permissions"],
    friendships: ["sender_id", "receiver_id", "status"],
    friend_server_invites: ["server_id", "sender_id", "receiver_id"],
    messages: ["id", "channel_id", "author_id", "content"],
    sekai_direct_messages: ["id", "sender_id", "receiver_id", "content", "attachment_url"],
  };
  const missing = [];
  for (const [table, columns] of Object.entries(referencedColumns)) {
    const existing = tables.get(table) ?? migrationOwned.get(table);
    if (!existing) {
      missing.push(`public.${table} (table)`);
      continue;
    }
    for (const column of columns) {
      if (!tables.get(table)?.has(column) && !migrationOwned.get(table)?.has(column)) {
        missing.push(`public.${table}.${column}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Migration column references absent from snapshot: ${missing.join(", ")}`);
  assert.ok(migrations.every((sql) => sql.includes("public.")), "all three reviewed migrations are included");
});

test("every public relation read or written by migrations 002-004 exists in the snapshot or is created there", () => {
  const migrationOwned = new Set(["guild_timeouts", "sekai_moderation_dispatches", "sekai_invite_attempts"]);
  const used = new Set();
  const relationPattern = /\b(?:from|join|update|into|table|on)\s+public\.([a-z_][a-z0-9_]*)/gi;
  for (const sql of migrations) {
    for (const match of sql.matchAll(relationPattern)) used.add(match[1].toLowerCase());
  }
  const missing = [...used].filter((table) => !tables.has(table) && !migrationOwned.has(table));
  assert.deepEqual(missing, [], `Public relations absent from snapshot/migrations: ${missing.join(", ")}`);
});

test("invite RPC migration uses only the production invites table, never servers.invite_code", () => {
  const uncommented = migrations[0].replace(/--.*$/gm, "");
  assert.doesNotMatch(uncommented, /\binvite_code\b/i);
  assert.match(migrations[0], /public\.invites[\s\S]*?upper\(btrim\(i\.code\)\)/i);
});

test("role hierarchy semantics are explicit: greater position is higher", () => {
  const app = readFileSync(resolve(root, "app/page.tsx"), "utf8");
  assert.match(app, /\.order\("position", \{ ascending: false \}\)/i);
  const moderation = migrations[0];
  assert.match(moderation, /select max\(r\.position\)/i);
  assert.match(moderation, /sekai_actor_role_position\(p_server_id\)\s*>\s*public\.sekai_target_role_position/i);
  assert.match(moderation, /v_role_position\s*<\s*public\.sekai_actor_role_position/i);
});

test("direct member and role update grants cover every current app update payload", () => {
  const members = readFileSync(resolve(root, "components/UserSettingsModal.tsx"), "utf8");
  const roles = readFileSync(resolve(root, "components/ServerSettingsModal.tsx"), "utf8");
  const migration = migrations[0];
  const memberGrant = migration.match(/grant update\s*\(([\s\S]*?)\) on public\.members/i)?.[1] ?? "";
  const roleGrant = migration.match(/grant update\s*\(([^)]*)\)\s*on public\.roles/i)?.[1] ?? "";
  const memberColumns = ["nickname", "avatar_url", "avatar_position_x", "avatar_position_y", "avatar_zoom", "banner_url", "banner_position_x", "banner_position_y", "banner_zoom", "member_list_banner_url", "member_list_banner_position_x", "member_list_banner_position_y", "member_list_banner_zoom"];
  const roleColumns = ["icon_url", "insignia_url", "name", "color", "permissions", "position"];
  for (const column of memberColumns) {
    assert.match(members, new RegExp(`\\b${column}\\s*:`), `members update payload omits ${column}`);
    assert.match(memberGrant, new RegExp(`\\b${column}\\b`), `members GRANT UPDATE omits ${column}`);
  }
  for (const column of roleColumns) {
    assert.match(roles, new RegExp(`\\b${column}\\s*:`), `roles update payload omits ${column}`);
    assert.match(roleGrant, new RegExp(`\\b${column}\\b`), `roles GRANT UPDATE omits ${column}`);
  }
});

test("moderation server locks follow an authorization gate", () => {
  const sql = migrations[0];
  for (const functionName of ["sekai_can_manage_member", "sekai_can_manage_role", "sekai_can_create_role", "sekai_can_manage_ban", "moderate_server_member", "set_server_member_timeout", "set_server_member_nickname"]) {
    const start = sql.indexOf(`function public.${functionName}(`);
    assert.notEqual(start, -1, `missing function ${functionName}`);
    const end = sql.indexOf("$$;", start);
    const body = sql.slice(start, end);
    const lock = body.indexOf("pg_advisory_xact_lock");
    const permission = body.indexOf("has_permission") >= 0 ? body.indexOf("has_permission") : body.indexOf("sekai_can_manage_member");
    assert.ok(lock > permission, `${functionName} takes server lock before checking permission`);
  }
});
