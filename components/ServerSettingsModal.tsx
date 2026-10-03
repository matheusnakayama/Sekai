"use client";

import { useEffect, useState } from "react";
import { X, Trash2, Plus, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useDialogs } from "@/components/DialogProvider";
import {
  ServerAssetsPanel,
  ServerAuditPanel,
  ServerBansPanel,
  ServerDirectoryPanel,
  ServerIntegrationPanel,
  ServerMetricsPanel,
  ServerPreferencesPanel,
  ServerTemplatePanel,
} from "@/components/ServerSettingsAdvanced";
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSIONS,
  aggregateRolePermissions,
  toBigInt,
} from "@/lib/permissions";

type Tab = "geral" | "tag" | "engajamento" | "impulso" | "emoji" | "stickers" | "soundboard" | "cargos" | "canais" | "membros" | "convites" | "acesso" | "integracoes" | "apps" | "seguranca" | "auditoria" | "banimentos" | "automod" | "comunidade" | "modelo";

const SETTINGS_GROUPS: { title: string; items: [Tab, string][] }[] = [
  { title: "Servidor", items: [["geral", "Perfil do servidor"], ["tag", "Tag do servidor"], ["engajamento", "Engajamento"], ["impulso", "Vantagens de impulso"]] },
  { title: "Expressões", items: [["emoji", "Emoji"], ["stickers", "Figurinhas"], ["soundboard", "Painel de efeitos sonoros"]] },
  { title: "Pessoas", items: [["membros", "Membros"], ["cargos", "Cargos"], ["convites", "Convites"], ["acesso", "Acesso"]] },
  { title: "Apps", items: [["integracoes", "Integrações"], ["apps", "Diretório de apps"]] },
  { title: "Moderação", items: [["seguranca", "Configurações de segurança"], ["auditoria", "Registro de auditoria"], ["banimentos", "Banimentos"], ["automod", "AutoMod"]] },
  { title: "Comunidade", items: [["comunidade", "Habilitar comunidade"], ["modelo", "Modelo do servidor"]] },
  { title: "Organização", items: [["canais", "Canais e categorias"]] },
];

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
    viewAudit?: boolean;
  };
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

export function ServerSettingsModal({
  serverId,
  serverName,
  currentUserId,
  isOwner,
  perms,
  onClose,
  onChanged,
  onDeleted,
}: ServerSettingsModalProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("geral");

  async function onAudit(action: string, target?: string, details?: Record<string, unknown>) {
    const { error } = await supabase.from("server_audit_logs").insert({
      server_id: serverId,
      actor_id: currentUserId,
      action,
      target: target ?? null,
      details: details ?? {},
    });
    if (error) console.warn("Não foi possível gravar o registro de auditoria:", error.message);
  }

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-5">
      <div className="flex h-[min(860px,96vh)] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/[0.08] bg-discord-bg-secondary shadow-2xl">
        <aside className="flex w-[min(260px,38vw)] shrink-0 flex-col bg-discord-bg-darkest p-3 sm:p-4">
          <div className="mb-3 border-b border-white/[0.08] px-2 pb-3"><p className="truncate text-sm font-bold text-discord-header-primary">{serverName}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[.14em] text-discord-text-muted">Configurações</p></div>
          <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {SETTINGS_GROUPS.map((group) => <section key={group.title}><p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[.14em] text-discord-text-muted/80">{group.title}</p>{group.items.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={cn("mb-0.5 w-full rounded-lg px-2.5 py-2 text-left text-[13px] transition", tab === id ? "bg-discord-bg-modifier-hover text-discord-header-primary shadow-sm" : "text-discord-text-muted hover:bg-white/[0.04] hover:text-discord-text-normal")}>{label}</button>)}</section>)}
          </nav>
          <button onClick={onClose} className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-discord-text-muted transition hover:bg-white/[0.05] hover:text-white"><X className="h-4 w-4"/>Fechar configurações</button>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-7">
          <div className="mb-5 flex items-center justify-between border-b border-white/[0.06] pb-3">
            <span className="text-xs font-semibold text-discord-text-muted">{SETTINGS_GROUPS.flatMap((group) => group.items).find(([id]) => id === tab)?.[1]}</span>
            <button onClick={onClose} aria-label="Fechar configurações" className="rounded-lg p-2 text-discord-text-muted transition hover:bg-white/5 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {tab === "geral" && (
            <GeralTab
              serverId={serverId}
              serverName={serverName}
              canEdit={isOwner || perms.manageGuild}
              onChanged={onChanged}
              isOwner={isOwner}
              onDeleted={onDeleted}
            />
          )}
          {tab === "tag" && <ServerPreferencesPanel serverId={serverId} section="tag" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
          {(tab === "engajamento" || tab === "impulso") && <ServerMetricsPanel serverId={serverId} serverName={serverName}/>}
          {tab === "emoji" && <ServerAssetsPanel serverId={serverId} currentUserId={currentUserId} kind="emoji" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
          {tab === "stickers" && <ServerAssetsPanel serverId={serverId} currentUserId={currentUserId} kind="sticker" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
          {tab === "soundboard" && <ServerAssetsPanel serverId={serverId} currentUserId={currentUserId} kind="sound" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
          {tab === "acesso" && <ServerPreferencesPanel serverId={serverId} section="access" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
          {tab === "seguranca" && <ServerPreferencesPanel serverId={serverId} section="security" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
          {tab === "automod" && <ServerPreferencesPanel serverId={serverId} section="automod" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
          {tab === "comunidade" && <ServerPreferencesPanel serverId={serverId} section="community" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
          {tab === "banimentos" && <ServerBansPanel serverId={serverId} canManage={isOwner || perms.ban} onAudit={onAudit}/>}
          {tab === "auditoria" && <ServerAuditPanel serverId={serverId} canView={isOwner || !!perms.viewAudit}/>}
          {tab === "modelo" && <ServerTemplatePanel serverId={serverId} serverName={serverName}/>}
          {tab === "integracoes" && <ServerIntegrationPanel/>}
          {tab === "apps" && <ServerDirectoryPanel/>}
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
        </main>
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
  isOwner,
  onDeleted,
}: {
  serverId: string;
  serverName: string;
  canEdit: boolean;
  onChanged: () => void;
  isOwner: boolean;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [name, setName] = useState(serverName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.currentTarget.value = "";
    if (!file.type.startsWith("image/")) { await dialogs.notify({ title: "Arquivo inválido", message: "Escolha um arquivo de imagem." }); return; }
    if (file.size > 8 * 1024 * 1024) { await dialogs.notify({ title: "Imagem muito grande", message: "O ícone deve ter no máximo 8 MB." }); return; }
    const extension = file.name.split(".").pop()?.toLowerCase();
    const ext = extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : "png";
    const path = `${serverId}/icon-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("server-icons").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      await dialogs.notify({ title: "Falha no upload", message: error.message });
      return;
    }
    const iconUrl = supabase.storage.from("server-icons").getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await supabase.from("servers").update({ icon_url: iconUrl }).eq("id", serverId);
    if (updateError) { await dialogs.notify({ title: "Falha ao salvar ícone", message: updateError.message }); return; }
    onChanged();
  }

  async function handleSaveName() {
    setSaving(true);
    await supabase.from("servers").update({ name: name.trim() }).eq("id", serverId);
    setSaving(false);
    onChanged();
  }

  async function handleDeleteServer() {
    const confirmed = await dialogs.confirm({
      title: "Excluir servidor",
      message: `Excluir “${serverName}” e todos os seus canais, mensagens e membros? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir servidor",
      danger: true,
    });
    if (!confirmed) return;

    setDeleting(true);
    const { data, error } = await supabase
      .from("servers")
      .delete()
      .eq("id", serverId)
      .select("id")
      .maybeSingle();
    setDeleting(false);

    if (error || !data) {
      await dialogs.notify({
        title: "Não foi possível excluir o servidor",
        message: error?.message || "Confirme se você é o dono do servidor e se a policy servers_delete_owner está habilitada no Supabase.",
      });
      return;
    }

    onDeleted();
  }

  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase text-discord-text-muted">
        Ícone do servidor
      </label>
      <label className={cn("mb-4 inline-block", canEdit && "cursor-pointer")}>
        <input type="file" accept="image/gif,image/*" className="hidden" disabled={!canEdit} onChange={handleIconUpload} />
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

      {isOwner && (
        <section className="mt-8 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <h3 className="font-semibold text-red-300">Zona de perigo</h3>
          <p className="mt-1 text-sm text-discord-text-muted">
            Excluir o servidor remove também os canais e os dados relacionados.
          </p>
          <button
            type="button"
            onClick={() => void handleDeleteServer()}
            disabled={deleting}
            className="mt-3 flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            <Trash2 size={16} />
            {deleting ? "Excluindo…" : "Excluir servidor"}
          </button>
        </section>
      )}
    </div>
  );
}

// ---------------- Cargos ----------------
function CargosTab({ serverId, canEdit, onChanged }: { serverId: string; canEdit: boolean; onChanged: () => void }) {
  const supabase = createClient();
  const dialogs = useDialogs();
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
    const name = await dialogs.prompt({
      title: "Criar cargo",
      label: "Nome do cargo",
      placeholder: "Novo cargo",
      confirmLabel: "Criar cargo",
    });
    if (!name) return;
    const { data, error } = await supabase
      .from("roles")
      .insert({ server_id: serverId, name, position: roles.length })
      .select("id")
      .single();
    if (error) {
      await dialogs.notify({ title: "Não foi possível criar o cargo", message: error.message });
      return;
    }
    await load();
    if (data) setSelectedRoleId(data.id);
    onChanged();
  }

  async function handleDeleteRole(roleId: string) {
    const ok = await dialogs.confirm({
      title: "Apagar cargo",
      message: "Apagar esse cargo? Membros com ele perdem essas permissões.",
      confirmLabel: "Apagar",
    });
    if (!ok) return;
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
  const dialogs = useDialogs();
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
    const name = await dialogs.prompt({
      title: "Renomear canal",
      label: "Nome do canal",
      defaultValue: currentName,
      confirmLabel: "Salvar",
    });
    if (!name) return;
    await supabase.from("channels").update({ name: name.toLowerCase().replace(/\s+/g, "-") }).eq("id", id);
    await load();
    onChanged();
  }

  async function handleDeleteChannel(id: string) {
    const ok = await dialogs.confirm({
      title: "Apagar canal",
      message: "Apagar esse canal e todas as mensagens dele?",
      confirmLabel: "Apagar canal",
    });
    if (!ok) return;
    await supabase.from("channels").delete().eq("id", id);
    await load();
    onChanged();
  }

  async function handleRenameCategory(id: string, currentName: string) {
    const name = await dialogs.prompt({
      title: "Renomear categoria",
      label: "Nome da categoria",
      defaultValue: currentName,
      confirmLabel: "Salvar",
    });
    if (!name) return;
    await supabase.from("channel_categories").update({ name: name.toUpperCase() }).eq("id", id);
    await load();
  }

  async function handleDeleteCategory(id: string) {
    const ok = await dialogs.confirm({
      title: "Apagar categoria",
      message: "Apagar essa categoria? Os canais dela ficam sem categoria.",
      confirmLabel: "Apagar categoria",
    });
    if (!ok) return;
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
  const dialogs = useDialogs();
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
      await dialogs.notify({ title: "Não foi possível criar o convite", message: error.message });
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
  const dialogs = useDialogs();
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
    const ok = await dialogs.confirm({
      title: "Expulsar membro",
      message: "Expulsar esse membro? Ele poderá voltar com um novo convite.",
      confirmLabel: "Expulsar",
    });
    if (!ok) return;
    await supabase.from("members").delete().match({ server_id: serverId, user_id: userId });
    await load();
    onChanged();
  }

  async function handleBan(userId: string) {
    const reason = await dialogs.prompt({
      title: "Banir membro",
      label: "Motivo do banimento (opcional)",
      description: "O membro será removido do servidor e não poderá entrar de novo.",
      confirmLabel: "Banir",
      allowEmpty: true,
      maxLength: 200,
    });
    if (reason === null) return; // cancelou
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
