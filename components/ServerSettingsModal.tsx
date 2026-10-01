"use client";

import { useEffect, useState } from "react";
import { X, Trash2, Plus, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSIONS,
  aggregateRolePermissions,
  toBigInt,
} from "@/lib/permissions";

type Tab = "geral" | "cargos" | "canais" | "convites" | "membros";

interface ServerSettingsModalProps {
  serverId: string;
  serverName: string;
  currentUserId: string;
  isOwner: boolean;
  perms: {
    manageGuild: boolean;
    manageRoles: boolean;
    manageChannels: boolean;
    createInvite: boolean;
    kick: boolean;
    ban: boolean;
  };
  onClose: () => void;
  onChanged: () => void;
}

export function ServerSettingsModal({
  serverId,
  serverName,
  currentUserId,
  isOwner,
  perms,
  onClose,
  onChanged,
}: ServerSettingsModalProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("geral");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[600px] w-full max-w-3xl overflow-hidden rounded-lg bg-discord-bg-secondary shadow-xl">
        <div className="w-52 shrink-0 bg-discord-bg-darkest p-3">
          <p className="mb-2 truncate px-2 text-xs font-bold uppercase text-discord-text-muted">{serverName}</p>
          {(
            [
              ["geral", "Visão geral"],
              ["cargos", "Cargos"],
              ["canais", "Canais"],
              ["convites", "Convites"],
              ["membros", "Membros"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "mb-0.5 w-full rounded px-2 py-1.5 text-left text-sm",
                tab === id
                  ? "bg-discord-bg-modifier-hover text-discord-header-primary"
                  : "text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-text-normal"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-discord-header-primary capitalize">{tab}</h2>
            <button onClick={onClose} className="text-discord-text-muted hover:text-discord-text-normal">
              <X className="h-5 w-5" />
            </button>
          </div>

          {tab === "geral" && (
            <GeralTab
              serverId={serverId}
              serverName={serverName}
              canEdit={isOwner || perms.manageGuild}
              onChanged={onChanged}
            />
          )}
          {tab === "cargos" && (
            <CargosTab serverId={serverId} canEdit={isOwner || perms.manageRoles} onChanged={onChanged} />
          )}
          {tab === "canais" && (
            <CanaisTab serverId={serverId} canEdit={isOwner || perms.manageChannels} onChanged={onChanged} />
          )}
          {tab === "convites" && (
            <ConvitesTab
              serverId={serverId}
              currentUserId={currentUserId}
              canCreate={isOwner || perms.createInvite}
            />
          )}
          {tab === "membros" && (
            <MembrosTab
              serverId={serverId}
              currentUserId={currentUserId}
              canKick={isOwner || perms.kick}
              canBan={isOwner || perms.ban}
              canAssignRoles={isOwner || perms.manageRoles}
              onChanged={onChanged}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Visão geral ----------------
function GeralTab({
  serverId,
  serverName,
  canEdit,
  onChanged,
}: {
  serverId: string;
  serverName: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState(serverName);
  const [saving, setSaving] = useState(false);

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop();
    const path = `${serverId}/icon-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("server-icons").upload(path, file, { upsert: true });
    if (error) {
      alert("Falha no upload: " + error.message);
      return;
    }
    const iconUrl = supabase.storage.from("server-icons").getPublicUrl(path).data.publicUrl;
    await supabase.from("servers").update({ icon_url: iconUrl }).eq("id", serverId);
    onChanged();
  }

  async function handleSaveName() {
    setSaving(true);
    await supabase.from("servers").update({ name: name.trim() }).eq("id", serverId);
    setSaving(false);
    onChanged();
  }

  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase text-discord-text-muted">
        Ícone do servidor
      </label>
      <label className={cn("mb-4 inline-block", canEdit && "cursor-pointer")}>
        <input type="file" accept="image/*" className="hidden" disabled={!canEdit} onChange={handleIconUpload} />
        <span className="rounded bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover">
          Enviar imagem
        </span>
      </label>

      <label className="mb-2 block text-xs font-semibold uppercase text-discord-text-muted">
        Nome do servidor
        <input
          value={name}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded bg-discord-bg-primary px-3 py-2 text-discord-text-normal focus:outline-none disabled:opacity-60"
        />
      </label>

      {canEdit && (
        <button
          onClick={handleSaveName}
          disabled={saving}
          className="mt-2 rounded bg-discord-brand px-4 py-2 text-sm font-medium text-white hover:bg-discord-brand-hover"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      )}
      {!canEdit && (
        <p className="mt-2 text-xs text-discord-text-muted">
          Você não tem permissão para editar as informações do servidor.
        </p>
      )}
    </div>
  );
}

// ---------------- Cargos ----------------
function CargosTab({ serverId, canEdit, onChanged }: { serverId: string; canEdit: boolean; onChanged: () => void }) {
  const supabase = createClient();
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("roles")
      .select("id, name, color, position, permissions, is_default")
      .eq("server_id", serverId)
      .order("position", { ascending: false });
    setRoles(data ?? []);
    if (!selectedRoleId && data?.[0]) setSelectedRoleId(data[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  async function handleCreateRole() {
    const name = window.prompt("Nome do novo cargo:");
    if (!name?.trim()) return;
    const { data, error } = await supabase
      .from("roles")
      .insert({ server_id: serverId, name: name.trim(), position: roles.length })
      .select("id")
      .single();
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    await load();
    if (data) setSelectedRoleId(data.id);
    onChanged();
  }

  async function handleDeleteRole(roleId: string) {
    if (!window.confirm("Apagar esse cargo? Membros com ele perdem essas permissões.")) return;
    await supabase.from("roles").delete().eq("id", roleId);
    setSelectedRoleId(null);
    await load();
    onChanged();
  }

  async function togglePermission(bit: keyof typeof PERMISSIONS) {
    if (!selectedRole) return;
    const current = toBigInt(selectedRole.permissions);
    const bitValue = PERMISSIONS[bit];
    const next = (current & bitValue) !== 0n ? current & ~bitValue : current | bitValue;
    await supabase.from("roles").update({ permissions: next.toString() }).eq("id", selectedRole.id);
    await load();
    onChanged();
  }

  return (
    <div className="flex gap-4">
      <div className="w-44 shrink-0">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedRoleId(r.id)}
            className={cn(
              "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
              selectedRoleId === r.id ? "bg-discord-bg-modifier-hover" : "hover:bg-discord-bg-modifier-hover"
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
            <span className="truncate text-discord-text-normal">{r.name}</span>
          </button>
        ))}
        {canEdit && (
          <button
            onClick={handleCreateRole}
            className="mt-2 flex items-center gap-1 text-xs text-discord-text-muted hover:text-discord-text-normal"
          >
            <Plus className="h-3.5 w-3.5" /> Criar cargo
          </button>
        )}
      </div>

      {selectedRole && (
        <div className="flex-1">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-discord-header-primary">{selectedRole.name}</p>
            {canEdit && !selectedRole.is_default && (
              <button onClick={() => handleDeleteRole(selectedRole.id)} className="text-discord-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase text-discord-text-muted">{group.label}</p>
              {group.bits.map((bit) => {
                const checked = (toBigInt(selectedRole.permissions) & PERMISSIONS[bit]) !== 0n;
                return (
                  <label key={bit} className="mb-1 flex items-center gap-2 text-sm text-discord-text-normal">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canEdit}
                      onChange={() => togglePermission(bit)}
                    />
                    {PERMISSION_LABELS[bit]}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Canais ----------------
function CanaisTab({ serverId, canEdit, onChanged }: { serverId: string; canEdit: boolean; onChanged: () => void }) {
  const supabase = createClient();
  const [categories, setCategories] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);

  async function load() {
    const { data: cats } = await supabase
      .from("channel_categories")
      .select("id, name")
      .eq("server_id", serverId)
      .order("position");
    const { data: chans } = await supabase
      .from("channels")
      .select("id, name, type, category_id")
      .eq("server_id", serverId)
      .order("position");
    setCategories(cats ?? []);
    setChannels(chans ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function handleRenameChannel(id: string, currentName: string) {
    const name = window.prompt("Novo nome do canal:", currentName);
    if (!name?.trim()) return;
    await supabase.from("channels").update({ name: name.trim() }).eq("id", id);
    await load();
    onChanged();
  }

  async function handleDeleteChannel(id: string) {
    if (!window.confirm("Apagar esse canal e todas as mensagens dele?")) return;
    await supabase.from("channels").delete().eq("id", id);
    await load();
    onChanged();
  }

  async function handleRenameCategory(id: string, currentName: string) {
    const name = window.prompt("Novo nome da categoria:", currentName);
    if (!name?.trim()) return;
    await supabase.from("channel_categories").update({ name: name.trim().toUpperCase() }).eq("id", id);
    await load();
  }

  async function handleDeleteCategory(id: string) {
    if (!window.confirm("Apagar essa categoria? Os canais dela ficam sem categoria.")) return;
    await supabase.from("channel_categories").delete().eq("id", id);
    await load();
    onChanged();
  }

  return (
    <div>
      {categories.map((cat) => (
        <div key={cat.id} className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-discord-text-muted">{cat.name}</p>
            {canEdit && (
              <div className="flex gap-2">
                <button onClick={() => handleRenameCategory(cat.id, cat.name)} className="text-xs text-discord-text-muted hover:text-discord-text-normal">
                  renomear
                </button>
                <button onClick={() => handleDeleteCategory(cat.id)} className="text-discord-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {channels
            .filter((c) => c.category_id === cat.id)
            .map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1 pl-2 text-sm text-discord-text-normal">
                <span>{c.type === "text" ? "#" : "🔊"} {c.name}</span>
                {canEdit && (
                  <div className="flex gap-2">
                    <button onClick={() => handleRenameChannel(c.id, c.name)} className="text-xs text-discord-text-muted hover:text-discord-text-normal">
                      renomear
                    </button>
                    <button onClick={() => handleDeleteChannel(c.id)} className="text-discord-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

// ---------------- Convites ----------------
function ConvitesTab({
  serverId,
  currentUserId,
  canCreate,
}: {
  serverId: string;
  currentUserId: string;
  canCreate: boolean;
}) {
  const supabase = createClient();
  const [invites, setInvites] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase
      .from("invites")
      .select("code, uses, max_uses, expires_at, created_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false });
    setInvites(data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function handleCreateInvite() {
    const { data: firstChannel } = await supabase
      .from("channels")
      .select("id")
      .eq("server_id", serverId)
      .limit(1)
      .single();

    const { error } = await supabase.from("invites").insert({
      server_id: serverId,
      channel_id: firstChannel?.id,
      inviter_id: currentUserId,
      max_uses: 0,
      max_age: 0,
    });
    if (error) {
      alert("Erro ao criar convite: " + error.message);
      return;
    }
    await load();
  }

  async function handleRevoke(code: string) {
    await supabase.from("invites").delete().eq("code", code);
    await load();
  }

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code);
  }

  return (
    <div>
      {canCreate && (
        <button
          onClick={handleCreateInvite}
          className="mb-4 flex items-center gap-1.5 rounded bg-discord-brand px-3 py-2 text-sm font-medium text-white hover:bg-discord-brand-hover"
        >
          <Plus className="h-4 w-4" /> Gerar novo convite
        </button>
      )}

      {invites.map((inv) => (
        <div key={inv.code} className="mb-2 flex items-center justify-between rounded bg-discord-bg-primary px-3 py-2">
          <div>
            <p className="font-mono text-sm text-discord-header-primary">{inv.code}</p>
            <p className="text-xs text-discord-text-muted">
              {inv.uses} usos{inv.max_uses > 0 ? ` / ${inv.max_uses}` : " (ilimitado)"}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleCopy(inv.code)} className="text-discord-text-muted hover:text-discord-text-normal">
              <Copy className="h-4 w-4" />
            </button>
            <button onClick={() => handleRevoke(inv.code)} className="text-discord-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      {invites.length === 0 && <p className="text-sm text-discord-text-muted">Nenhum convite ativo ainda.</p>}
    </div>
  );
}

// ---------------- Membros ----------------
function MembrosTab({
  serverId,
  currentUserId,
  canKick,
  canBan,
  canAssignRoles,
  onChanged,
}: {
  serverId: string;
  currentUserId: string;
  canKick: boolean;
  canBan: boolean;
  canAssignRoles: boolean;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  async function load() {
    const { data: mems } = await supabase
      .from("members")
      .select("user_id, profiles(display_name, username)")
      .eq("server_id", serverId);

    const { data: mroles } = await supabase
      .from("member_roles")
      .select("user_id, role_id")
      .eq("server_id", serverId);

    const { data: allRoles } = await supabase
      .from("roles")
      .select("id, name, color")
      .eq("server_id", serverId);

    setRoles(allRoles ?? []);
    setMembers(
      (mems ?? []).map((m: any) => ({
        ...m,
        roleIds: (mroles ?? []).filter((r) => r.user_id === m.user_id).map((r) => r.role_id),
      }))
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function handleKick(userId: string) {
    if (!window.confirm("Expulsar esse membro?")) return;
    await supabase.from("members").delete().match({ server_id: serverId, user_id: userId });
    await load();
    onChanged();
  }

  async function handleBan(userId: string) {
    const reason = window.prompt("Motivo do banimento (opcional):") ?? "";
    await supabase.from("guild_bans").insert({ server_id: serverId, user_id: userId, executor_id: currentUserId, reason });
    await supabase.from("members").delete().match({ server_id: serverId, user_id: userId });
    await load();
    onChanged();
  }

  async function toggleRole(userId: string, roleId: string, has: boolean) {
    if (has) {
      await supabase.from("member_roles").delete().match({ server_id: serverId, user_id: userId, role_id: roleId });
    } else {
      await supabase.from("member_roles").insert({ server_id: serverId, user_id: userId, role_id: roleId });
    }
    await load();
    onChanged();
  }

  return (
    <div>
      {members.map((m) => (
        <div key={m.user_id} className="mb-2 rounded bg-discord-bg-primary p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-discord-header-primary">
              {m.profiles?.display_name || m.profiles?.username}
            </p>
            {m.user_id !== currentUserId && (
              <div className="flex gap-3">
                {canKick && (
                  <button onClick={() => handleKick(m.user_id)} className="text-xs text-discord-text-muted hover:text-discord-header-primary">
                    Expulsar
                  </button>
                )}
                {canBan && (
                  <button onClick={() => handleBan(m.user_id)} className="text-xs text-discord-danger hover:underline">
                    Banir
                  </button>
                )}
              </div>
            )}
          </div>
          {canAssignRoles && (
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const has = m.roleIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleRole(m.user_id, r.id, has)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs",
                      has
                        ? "border-transparent bg-discord-brand text-white"
                        : "border-discord-text-muted text-discord-text-muted hover:text-discord-text-normal"
                    )}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
