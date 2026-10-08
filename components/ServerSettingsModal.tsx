"use client";

import { useEffect, useState } from "react";
import { X, Trash2, Plus, Copy, Search, Users, Eye, Pencil, ShieldCheck, Palette, Check, GripVertical, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useDialogs } from "@/components/DialogProvider";
import { RoleBadgeList, RoleIcon } from "@/components/RoleBadgeList";
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
  onPlaySoundEffect?: (serverId: string, sound: { id: string; name: string; asset_url: string }) => Promise<boolean>;
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
  onPlaySoundEffect,
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
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-0 backdrop-blur-sm sm:p-5">
      <div className="flex h-[100dvh] w-full max-w-6xl overflow-hidden bg-discord-bg-secondary shadow-2xl sm:h-[min(860px,96vh)] sm:rounded-2xl sm:border sm:border-white/[0.08]">
        <aside className="hidden w-[min(260px,38vw)] shrink-0 flex-col bg-discord-bg-darkest p-3 sm:flex sm:p-4">
          <div className="mb-3 border-b border-white/[0.08] px-2 pb-3"><p className="truncate text-sm font-bold text-discord-header-primary">{serverName}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[.14em] text-discord-text-muted">Configurações</p></div>
          <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {SETTINGS_GROUPS.map((group) => <section key={group.title}><p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[.14em] text-discord-text-muted/80">{group.title}</p>{group.items.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={cn("mb-0.5 w-full rounded-lg px-2.5 py-2 text-left text-[13px] transition", tab === id ? "bg-discord-bg-modifier-hover text-discord-header-primary shadow-sm" : "text-discord-text-muted hover:bg-white/[0.04] hover:text-discord-text-normal")}>{label}</button>)}</section>)}
          </nav>
          <button onClick={onClose} className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-discord-text-muted transition hover:bg-white/[0.05] hover:text-white"><X className="h-4 w-4"/>Fechar configurações</button>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3 sm:mb-5">
            <div className="min-w-0 flex-1">
              <span className="hidden text-xs font-semibold text-discord-text-muted sm:block">{SETTINGS_GROUPS.flatMap((group) => group.items).find(([id]) => id === tab)?.[1]}</span>
              <select value={tab} onChange={(event) => setTab(event.target.value as Tab)} aria-label="Seção das configurações do servidor" className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-discord-bg-primary px-3 text-sm font-semibold text-discord-header-primary outline-none focus:border-discord-brand sm:hidden">
                {SETTINGS_GROUPS.map((group) => <optgroup key={group.title} label={group.title}>{group.items.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>)}
              </select>
            </div>
            <button onClick={onClose} aria-label="Fechar configurações" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-discord-text-muted transition hover:bg-white/5 hover:text-white">
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
          {tab === "soundboard" && <ServerAssetsPanel serverId={serverId} currentUserId={currentUserId} kind="sound" canManage={isOwner || perms.manageGuild} onAudit={onAudit} onPlaySoundEffect={onPlaySoundEffect}/>}
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
            <CargosTab serverId={serverId} canEdit={isOwner || perms.manageRoles} onChanged={onChanged} onAudit={onAudit} />
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
const ROLE_COLORS = ["#99aab5", "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63", "#f1c40f", "#e67e22", "#e74c3c", "#607d8b", "#16a085", "#27ae60", "#2980b9", "#8e44ad", "#c0392b", "#34495e"];
const ROLE_ICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_ROLE_ICON_SIZE = 5 * 1024 * 1024;

const PERMISSION_DESCRIPTIONS: Record<keyof typeof PERMISSIONS, string> = {
  ADMINISTRATOR: "Acesso completo ao servidor e a todas as permissões, inclusive as futuras.",
  MANAGE_GUILD: "Altere as configurações e os dados principais do servidor.",
  MANAGE_ROLES: "Crie, edite e organize cargos abaixo do seu cargo mais alto.",
  MANAGE_CHANNELS: "Crie, edite e remova canais e categorias do servidor.",
  VIEW_AUDIT_LOG: "Consulte ações recentes de moderação e mudanças no servidor.",
  CREATE_INSTANT_INVITE: "Crie links para convidar pessoas para este servidor.",
  CHANGE_NICKNAME: "Altere o próprio apelido neste servidor.",
  MANAGE_NICKNAMES: "Altere os apelidos dos outros membros.",
  KICK_MEMBERS: "Remova membros do servidor. Eles ainda poderão receber outro convite.",
  BAN_MEMBERS: "Bana membros para impedir que voltem a entrar no servidor.",
  MODERATE_MEMBERS: "Aplique um tempo de silêncio temporário aos membros.",
  VIEW_CHANNEL: "Veja os canais aos quais este cargo tem acesso.",
  SEND_MESSAGES: "Envie mensagens nos canais de texto visíveis.",
  MANAGE_MESSAGES: "Apague mensagens de outras pessoas e modere conversas.",
  EMBED_LINKS: "Mostre prévias incorporadas ao enviar links.",
  ATTACH_FILES: "Envie imagens e outros arquivos nas conversas.",
  READ_MESSAGE_HISTORY: "Veja mensagens enviadas antes de entrar no canal.",
  MENTION_EVERYONE: "Use menções que notificam todos os membros do canal.",
  ADD_REACTIONS: "Adicione reações às mensagens do canal.",
  USE_EXTERNAL_EMOJIS: "Use emojis personalizados de outros servidores.",
  CONNECT: "Entre em canais de voz do servidor.",
  SPEAK: "Use o microfone nos canais de voz.",
  MUTE_MEMBERS: "Silencie o microfone de outros participantes da chamada.",
  DEAFEN_MEMBERS: "Ensurdeça outros participantes da chamada.",
  MOVE_MEMBERS: "Mova participantes entre canais de voz.",
};

function CargosTab({ serverId, canEdit, onChanged, onAudit }: { serverId: string; canEdit: boolean; onChanged: () => void; onAudit: (action: string, target?: string, details?: Record<string, unknown>) => Promise<void> }) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [roles, setRoles] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [section, setSection] = useState<"display" | "permissions" | "members">("display");
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState(ROLE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const [insigniaUploading, setInsigniaUploading] = useState(false);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLORS[0]);
  const [newRoleIconFile, setNewRoleIconFile] = useState<File | null>(null);
  const [newRoleIconPreview, setNewRoleIconPreview] = useState<string | null>(null);
  const [newRoleInsigniaFile, setNewRoleInsigniaFile] = useState<File | null>(null);
  const [newRoleInsigniaPreview, setNewRoleInsigniaPreview] = useState<string | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [createRoleError, setCreateRoleError] = useState("");
  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const [{ data: roleRows }, { data: memberRows }, { data: assignments }] = await Promise.all([
      supabase.from("roles").select("id, name, color, icon_url, insignia_url, position, permissions, is_default").eq("server_id", serverId).order("position", { ascending: false }),
      supabase.from("members").select("user_id, profiles(display_name, username)").eq("server_id", serverId),
      supabase.from("member_roles").select("user_id, role_id").eq("server_id", serverId),
    ]);
    const roleCounts = new Map<string, number>();
    (assignments ?? []).forEach((assignment: any) => roleCounts.set(assignment.role_id, (roleCounts.get(assignment.role_id) ?? 0) + 1));
    const memberships = new Map<string, string[]>();
    (assignments ?? []).forEach((assignment: any) => memberships.set(assignment.user_id, [...(memberships.get(assignment.user_id) ?? []), assignment.role_id]));
    const nextRoles = (roleRows ?? []).map((role: any) => ({ ...role, iconUrl: role.icon_url ?? null, insigniaUrl: role.insignia_url ?? null, memberCount: roleCounts.get(role.id) ?? 0 }));
    setRoles(nextRoles);
    setMembers((memberRows ?? []).map((member: any) => ({ ...member, roleIds: memberships.get(member.user_id) ?? [] })));
    setSelectedRoleId((current) => current && nextRoles.some((role: any) => role.id === current) ? current : nextRoles[0]?.id ?? null);
  }

  function handleNewRoleIconChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!ROLE_ICON_TYPES.has(file.type)) { setNewRoleIconFile(null); setNewRoleIconPreview(null); setCreateRoleError("Escolha uma imagem PNG, JPG, WebP ou GIF."); return; }
    if (file.size > MAX_ROLE_ICON_SIZE) { setNewRoleIconFile(null); setNewRoleIconPreview(null); setCreateRoleError("O ícone do cargo deve ter no máximo 5 MB."); return; }
    setCreateRoleError("");
    setNewRoleIconFile(file);
    const reader = new FileReader();
    reader.onload = () => setNewRoleIconPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function handleNewRoleInsigniaChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!ROLE_ICON_TYPES.has(file.type)) { setNewRoleInsigniaFile(null); setNewRoleInsigniaPreview(null); setCreateRoleError("Escolha uma insígnia PNG, JPG, WebP ou GIF."); return; }
    if (file.size > MAX_ROLE_ICON_SIZE) { setNewRoleInsigniaFile(null); setNewRoleInsigniaPreview(null); setCreateRoleError("A insígnia do cargo deve ter no máximo 5 MB."); return; }
    setCreateRoleError("");
    setNewRoleInsigniaFile(file);
    const reader = new FileReader();
    reader.onload = () => setNewRoleInsigniaPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function removeStoredRoleAsset(assetUrl: string | null | undefined, folder: "role-icons" | "role-insignias") {
    if (!assetUrl) return;
    const marker = "/storage/v1/object/public/server-assets/";
    const markerIndex = assetUrl.indexOf(marker);
    if (markerIndex < 0) return;
    let path: string;
    try { path = decodeURIComponent(assetUrl.slice(markerIndex + marker.length).split("?")[0]); } catch { return; }
    if (!path.startsWith(`${serverId}/${folder}/`)) return;
    await supabase.storage.from("server-assets").remove([path]);
  }

  async function persistRoleIcon(roleId: string, file: File, previousIconUrl?: string | null): Promise<{ iconUrl?: string; error?: string }> {
    if (!ROLE_ICON_TYPES.has(file.type)) return { error: "Escolha uma imagem PNG, JPG, WebP ou GIF." };
    if (file.size > MAX_ROLE_ICON_SIZE) return { error: "O ícone do cargo deve ter no máximo 5 MB." };

    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const uniqueName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `${serverId}/role-icons/${roleId}/${uniqueName}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("server-assets").upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "31536000",
    });
    if (uploadError) return { error: uploadError.message };

    const iconUrl = supabase.storage.from("server-assets").getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await supabase.from("roles").update({ icon_url: iconUrl }).eq("id", roleId).eq("server_id", serverId);
    if (updateError) { await removeStoredRoleAsset(iconUrl, "role-icons"); return { error: updateError.message }; }
    await removeStoredRoleAsset(previousIconUrl, "role-icons");
    return { iconUrl };
  }

  async function persistRoleInsignia(roleId: string, file: File, previousUrl?: string | null): Promise<{ insigniaUrl?: string; error?: string }> {
    if (!ROLE_ICON_TYPES.has(file.type)) return { error: "Escolha uma insígnia PNG, JPG, WebP ou GIF." };
    if (file.size > MAX_ROLE_ICON_SIZE) return { error: "A insígnia do cargo deve ter no máximo 5 MB." };
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const uniqueName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `${serverId}/role-insignias/${roleId}/${uniqueName}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("server-assets").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
    if (uploadError) return { error: uploadError.message };
    const insigniaUrl = supabase.storage.from("server-assets").getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await supabase.from("roles").update({ insignia_url: insigniaUrl }).eq("id", roleId).eq("server_id", serverId);
    if (updateError) { await removeStoredRoleAsset(insigniaUrl, "role-insignias"); return { error: updateError.message }; }
    await removeStoredRoleAsset(previousUrl, "role-insignias");
    return { insigniaUrl };
  }

  async function handleSelectedRoleIconChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !selectedRole || selectedRole.is_default || !canEdit) return;
    setIconUploading(true);
    setError("");
    const result = await persistRoleIcon(selectedRole.id, file, selectedRole.icon_url);
    setIconUploading(false);
    if (result.error) { setError(`Não foi possível salvar a imagem: ${result.error}`); return; }
    await onAudit("role.icon.update", selectedRole.name, { role_id: selectedRole.id });
    await load();
    onChanged();
  }

  async function removeSelectedRoleIcon() {
    if (!selectedRole || selectedRole.is_default || !canEdit) return;
    setIconUploading(true);
    setError("");
    const { error: updateError } = await supabase.from("roles").update({ icon_url: null }).eq("id", selectedRole.id).eq("server_id", serverId);
    setIconUploading(false);
    if (updateError) { setError(`Não foi possível remover a imagem: ${updateError.message}`); return; }
    await removeStoredRoleAsset(selectedRole.icon_url, "role-icons");
    await onAudit("role.icon.remove", selectedRole.name, { role_id: selectedRole.id });
    await load();
    onChanged();
  }

  async function handleSelectedRoleInsigniaChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !selectedRole || selectedRole.is_default || !canEdit) return;
    setInsigniaUploading(true);
    setError("");
    const result = await persistRoleInsignia(selectedRole.id, file, selectedRole.insignia_url);
    setInsigniaUploading(false);
    if (result.error) { setError(`Não foi possível salvar a insígnia: ${result.error}`); return; }
    await onAudit("role.insignia.update", selectedRole.name, { role_id: selectedRole.id });
    await load();
    onChanged();
  }

  async function removeSelectedRoleInsignia() {
    if (!selectedRole || selectedRole.is_default || !canEdit) return;
    setInsigniaUploading(true);
    setError("");
    const { error: updateError } = await supabase.from("roles").update({ insignia_url: null }).eq("id", selectedRole.id).eq("server_id", serverId);
    setInsigniaUploading(false);
    if (updateError) { setError(`Não foi possível remover a insígnia: ${updateError.message}`); return; }
    await removeStoredRoleAsset(selectedRole.insignia_url, "role-insignias");
    await onAudit("role.insignia.remove", selectedRole.name, { role_id: selectedRole.id });
    await load();
    onChanged();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  useEffect(() => {
    if (!selectedRole) return;
    setRoleName(selectedRole.name);
    setRoleColor(selectedRole.color || ROLE_COLORS[0]);
    setSection("display");
    setError("");
    // O conteúdo só precisa ser recarregado quando o usuário escolhe outro cargo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoleId]);
  const filteredRoles = roles.filter((role) => role.name.toLowerCase().includes(search.trim().toLowerCase()));
  const currentRoleMembers = members.filter((member) => member.roleIds.includes(selectedRole?.id));
  const availableMembers = members.filter((member) => !member.roleIds.includes(selectedRole?.id) && `${member.profiles?.display_name ?? ""} ${member.profiles?.username ?? ""}`.toLowerCase().includes(memberSearch.toLowerCase()));

  async function saveRoleAppearance() {
    if (!selectedRole || !canEdit || selectedRole.is_default) return;
    const cleanName = roleName.trim();
    if (!cleanName) { setError("O cargo precisa ter um nome."); return; }
    setSaving(true); setError("");
    const { error: saveError } = await supabase.from("roles").update({ name: cleanName, color: roleColor }).eq("id", selectedRole.id).eq("server_id", serverId);
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    await onAudit("role.update", cleanName, { role_id: selectedRole.id });
    await load();
    onChanged();
  }

  async function handleCreateRole() {
    const cleanName = newRoleName.trim();
    if (!cleanName) { setCreateRoleError("Dê um nome para o novo cargo."); return; }
    setCreatingRole(true);
    setCreateRoleError("");
    const { data, error } = await supabase
      .from("roles")
      .insert({ server_id: serverId, name: cleanName, color: newRoleColor, position: roles.filter((role) => !role.is_default).length })
      .select("id")
      .single();
    if (error) {
      setCreatingRole(false);
      setCreateRoleError(`Não foi possível criar o cargo: ${error.message}`);
      return;
    }
    if (newRoleIconFile && data?.id) {
      const iconResult = await persistRoleIcon(data.id, newRoleIconFile);
      if (iconResult.error) await dialogs.notify({ title: "Cargo criado sem imagem", message: `O cargo foi salvo, mas a imagem não pôde ser enviada: ${iconResult.error}` });
    }
    if (newRoleInsigniaFile && data?.id) {
      const insigniaResult = await persistRoleInsignia(data.id, newRoleInsigniaFile);
      if (insigniaResult.error) await dialogs.notify({ title: "Cargo criado sem insígnia", message: `O cargo foi salvo, mas a insígnia não pôde ser enviada: ${insigniaResult.error}` });
    }
    await onAudit("role.create", cleanName, { role_id: data?.id });
    await load();
    if (data) setSelectedRoleId(data.id);
    setNewRoleName("");
    setNewRoleColor(ROLE_COLORS[0]);
    setNewRoleIconFile(null);
    setNewRoleIconPreview(null);
    setNewRoleInsigniaFile(null);
    setNewRoleInsigniaPreview(null);
    setCreateRoleOpen(false);
    setCreateRoleError("");
    setCreatingRole(false);
    onChanged();
  }

  async function handleDeleteRole(roleId: string) {
    const ok = await dialogs.confirm({
      title: "Apagar cargo",
      message: "Apagar esse cargo? Membros com ele perdem essas permissões.",
      confirmLabel: "Apagar",
    });
    if (!ok) return;
    const removedRole = roles.find((role) => role.id === roleId);
    const { error } = await supabase.from("roles").delete().eq("id", roleId);
    if (error) { await dialogs.notify({ title: "Não foi possível apagar o cargo", message: error.message }); return; }
    await onAudit("role.delete", removedRole?.name ?? roleId, { role_id: roleId });
    setSelectedRoleId(null);
    await load();
    onChanged();
  }

  async function togglePermission(bit: keyof typeof PERMISSIONS) {
    if (!selectedRole || !canEdit) return;
    const current = toBigInt(selectedRole.permissions);
    const bitValue = PERMISSIONS[bit];
    const next = (current & bitValue) !== 0n ? current & ~bitValue : current | bitValue;
    const { error } = await supabase.from("roles").update({ permissions: next.toString() }).eq("id", selectedRole.id);
    if (error) { setError(error.message); return; }
    await onAudit("role.permissions.update", selectedRole.name, { role_id: selectedRole.id, permission: bit });
    await load();
    onChanged();
  }

  async function clearPermissionGroup(bits: (keyof typeof PERMISSIONS)[]) {
    if (!selectedRole || !canEdit) return;
    const mask = bits.reduce((combined, bit) => combined | PERMISSIONS[bit], 0n);
    const current = toBigInt(selectedRole.permissions);
    const next = current & ~mask;
    if (next === current) return;
    const { error } = await supabase.from("roles").update({ permissions: next.toString() }).eq("id", selectedRole.id).eq("server_id", serverId);
    if (error) { setError(error.message); return; }
    await onAudit("role.permissions.clear_group", selectedRole.name, { role_id: selectedRole.id, group: bits });
    await load();
    onChanged();
  }

  async function reorderRole(droppedRoleId: string) {
    if (!canEdit || !draggedRoleId || draggedRoleId === droppedRoleId || search.trim()) return;
    const dragged = roles.find((role) => role.id === draggedRoleId);
    const dropped = roles.find((role) => role.id === droppedRoleId);
    if (!dragged || !dropped || dragged.is_default || dropped.is_default) return;

    const ordered = roles.filter((role) => !role.is_default);
    const from = ordered.findIndex((role) => role.id === draggedRoleId);
    const to = ordered.findIndex((role) => role.id === droppedRoleId);
    if (from < 0 || to < 0) return;
    const [moving] = ordered.splice(from, 1);
    ordered.splice(to, 0, moving);
    const updates = await Promise.all(ordered.map((role, index) =>
      supabase.from("roles").update({ position: ordered.length - index }).eq("id", role.id).eq("server_id", serverId)
    ));
    const failed = updates.find((result) => result.error)?.error;
    setDraggedRoleId(null);
    if (failed) {
      setError(`Não foi possível salvar a ordem dos cargos: ${failed.message}`);
      await load();
      return;
    }
    const defaultRole = roles.find((role) => role.is_default);
    const nextRoles = [...ordered, ...(defaultRole ? [defaultRole] : [])];
    setRoles(nextRoles);
    await onAudit("role.reorder", moving.name, { role_id: moving.id, position: ordered.length - to });
    onChanged();
  }

  async function toggleMemberRole(member: any, assign: boolean) {
    if (!selectedRole || !canEdit) return;
    const { error } = await supabase.rpc("assign_server_member_role", { p_server_id: serverId, p_user_id: member.user_id, p_role_id: selectedRole.id, p_assign: assign });
    if (error) { setError(error.message); return; }
    await load();
    onChanged();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 border-b border-white/[0.08] pb-5">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-discord-brand">Pessoas · Permissões</p>
        <h2 className="mt-1 text-2xl font-bold text-discord-header-primary">Cargos</h2>
        <p className="mt-2 text-sm text-discord-text-muted">Organize as pessoas e escolha o que cada cargo pode fazer no servidor.</p>
      </header>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-discord-bg-primary p-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-discord-brand/15 text-discord-brand"><Users size={19}/></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-discord-header-primary">Permissões padrão</span><span className="mt-0.5 block text-xs text-discord-text-muted">@everyone · aplicadas a todos os membros</span></span>
        <span className="text-xs text-discord-text-muted">{members.length} membro{members.length === 1 ? "" : "s"}</span>
        {roles.find((role) => role.is_default) && <button type="button" onClick={() => setSelectedRoleId(roles.find((role) => role.is_default).id)} className="rounded-lg p-2 text-discord-text-muted hover:bg-white/[0.06] hover:text-white" title="Editar permissões padrão"><Pencil size={15}/></button>}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.1] bg-discord-bg-primary px-3 py-2.5 text-discord-text-muted focus-within:border-discord-brand/70"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cargos" className="min-w-0 flex-1 bg-transparent text-sm text-discord-text-normal outline-none placeholder:text-discord-text-muted"/></label>
        {canEdit && <button type="button" aria-expanded={createRoleOpen} onClick={() => { setCreateRoleOpen((open) => !open); setCreateRoleError(""); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-discord-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"><Plus size={16}/>Criar cargo</button>}
      </div>
      {createRoleOpen && canEdit && <form onSubmit={(event) => { event.preventDefault(); void handleCreateRole(); }} className="mb-4 rounded-xl border border-discord-brand/25 bg-discord-brand/[0.06] p-4 shadow-sm">
        <div className="mb-3"><h3 className="text-sm font-semibold text-discord-header-primary">Novo cargo</h3><p className="mt-1 text-xs text-discord-text-muted">Defina o nome, a cor, o ícone circular e a insígnia que aparecerá junto ao cargo.</p></div>
        <label className="block text-xs font-semibold text-discord-text-muted">Nome do cargo<input autoFocus value={newRoleName} maxLength={80} onChange={(event) => setNewRoleName(event.target.value)} placeholder="Ex.: Equipe, VAMP, Moderador" className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-discord-bg-primary px-3 py-2.5 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70"/></label>
        <div className="mt-4"><p className="mb-2 text-xs font-semibold text-discord-text-muted">Cor do cargo</p><div className="flex flex-wrap gap-2">{ROLE_COLORS.map((color) => <button key={color} type="button" aria-label={`Selecionar cor ${color}`} aria-pressed={newRoleColor.toLowerCase() === color.toLowerCase()} onClick={() => setNewRoleColor(color)} className={cn("grid h-7 w-7 place-items-center rounded-full border-2 transition hover:scale-110", newRoleColor.toLowerCase() === color.toLowerCase() ? "border-white" : "border-transparent")} style={{ backgroundColor: color }}>{newRoleColor.toLowerCase() === color.toLowerCase() && <Check size={13} className="text-white drop-shadow"/>}</button>)}</div></div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.1] bg-discord-bg-primary px-3 py-2 text-xs font-semibold text-discord-text-normal transition hover:bg-white/[0.06]"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={handleNewRoleIconChange}/><ImageIcon size={15} className="text-discord-brand"/>{newRoleIconFile ? "Trocar ícone" : "Ícone circular"}</label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.1] bg-discord-bg-primary px-3 py-2 text-xs font-semibold text-discord-text-normal transition hover:bg-white/[0.06]"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={handleNewRoleInsigniaChange}/><ShieldCheck size={15} className="text-discord-brand"/>{newRoleInsigniaFile ? "Trocar insígnia" : "Insígnia do cargo"}</label>
          {(newRoleIconFile || newRoleInsigniaFile) && <span className="max-w-48 truncate text-xs text-discord-text-muted">{[newRoleIconFile?.name, newRoleInsigniaFile?.name].filter(Boolean).join(" · ")}</span>}
          <div className="ml-auto"><RoleBadgeList roles={[{ id: "new-role-preview", name: newRoleName.trim() || "Novo cargo", color: newRoleColor, iconUrl: newRoleIconPreview, insigniaUrl: newRoleInsigniaPreview }]} size="medium"/></div>
        </div>
        {createRoleError && <p role="alert" className="mt-3 text-xs text-red-300">{createRoleError}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setCreateRoleOpen(false); setNewRoleName(""); setNewRoleIconFile(null); setNewRoleIconPreview(null); setNewRoleInsigniaFile(null); setNewRoleInsigniaPreview(null); setCreateRoleError(""); }} className="rounded-lg px-3 py-2 text-xs font-semibold text-discord-text-muted transition hover:bg-white/[0.06] hover:text-white">Cancelar</button><button type="submit" disabled={creatingRole} className="rounded-lg bg-discord-brand px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{creatingRole ? "Criando…" : "Criar cargo"}</button></div>
      </form>}
      <p className="mb-4 text-xs leading-5 text-discord-text-muted">O membro usa a cor do cargo mais alto que possui. Selecione um cargo para editar sua aparência, permissões e membros.</p>

      <div className="grid min-h-[460px] overflow-hidden rounded-xl border border-white/[0.08] bg-discord-bg-primary lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,1.6fr)]">
        <aside className="border-b border-white/[0.08] p-3 lg:border-b-0 lg:border-r">
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_52px] px-2 text-[10px] font-bold uppercase tracking-wide text-discord-text-muted"><span>Cargos · {filteredRoles.length}</span><span className="text-right">Membros</span></div>
          {canEdit && !search.trim() && <p className="mb-2 flex items-center gap-1.5 px-2 text-[10px] text-discord-text-muted"><GripVertical size={13}/>Arraste os cargos para definir a hierarquia</p>}
          <div className="max-h-[520px] space-y-1 overflow-y-auto">{filteredRoles.map((role) => <div key={role.id} draggable={canEdit && !role.is_default && !search.trim()} onDragStart={(event) => { setDraggedRoleId(role.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", role.id); }} onDragOver={(event) => { if (canEdit && !role.is_default) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); void reorderRole(role.id); }} onDragEnd={() => setDraggedRoleId(null)} className={cn("group flex items-center gap-1.5 rounded-lg px-1.5 py-2 transition", selectedRoleId === role.id ? "bg-white/[0.08]" : "hover:bg-white/[0.04]", draggedRoleId === role.id && "opacity-40", canEdit && !role.is_default && !search.trim() && "cursor-grab active:cursor-grabbing")}>
            {canEdit && !role.is_default && <span aria-hidden="true" className="shrink-0 text-discord-text-muted/60"><GripVertical size={15}/></span>}
            <button type="button" onClick={() => setSelectedRoleId(role.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><RoleIcon role={role} size="medium"/><span className="truncate text-sm text-discord-text-normal">{role.name}{role.is_default ? <span className="ml-1 text-[10px] text-discord-text-muted">padrão</span> : null}</span></button>
            <span className="w-8 text-right text-xs tabular-nums text-discord-text-muted">{role.memberCount}</span>
            {!role.is_default && canEdit && <button type="button" onClick={() => void handleDeleteRole(role.id)} aria-label={`Apagar cargo ${role.name}`} className="rounded-md p-1.5 text-discord-text-muted opacity-60 transition hover:bg-red-500/10 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 size={14}/></button>}
          </div>)}{filteredRoles.length === 0 && <p className="px-2 py-6 text-center text-xs text-discord-text-muted">Nenhum cargo encontrado.</p>}</div>
        </aside>

        {selectedRole ? <section className="min-w-0 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-discord-text-muted">Editar cargo</p><h3 className="mt-1 text-lg font-bold text-discord-header-primary" style={{ color: selectedRole.color || undefined }}>{selectedRole.name}</h3></div><div className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-discord-text-muted">{selectedRole.memberCount} membro{selectedRole.memberCount === 1 ? "" : "s"}</div></div>
          <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-white/[0.08]">{([ ["display", "Exibição", Eye], ["permissions", "Permissões", ShieldCheck], ["members", `Gerenciar membros (${selectedRole.memberCount})`, Users] ] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setSection(id)} className={cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold transition", section === id ? "border-discord-brand text-discord-brand" : "border-transparent text-discord-text-muted hover:text-discord-text-normal")}><Icon size={14}/>{label}</button>)}</nav>
          {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}

          {section === "display" && <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.07] bg-discord-bg-secondary p-4">
              <h4 className="mb-4 text-sm font-semibold text-discord-header-primary">Identidade do cargo</h4>
              <label className="block text-xs font-semibold text-discord-text-muted">Nome do cargo<input value={roleName} disabled={!canEdit || selectedRole.is_default} maxLength={80} onChange={(event) => setRoleName(event.target.value)} className="mt-2 w-full rounded-lg border border-white/[0.1] bg-discord-bg-primary px-3 py-2.5 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70 disabled:opacity-60"/></label>
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-discord-bg-primary p-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-discord-text-muted">{selectedRole.iconUrl ? <img src={selectedRole.iconUrl} alt="" className="h-full w-full object-contain"/> : <ImageIcon size={18}/>}</span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-discord-text-normal">Imagem circular do cargo</span><span className="mt-0.5 block text-[11px] leading-4 text-discord-text-muted">Aparece no círculo antes do nome · até 5 MB</span></span>
                {canEdit && !selectedRole.is_default && <div className="flex shrink-0 items-center gap-2"><label className="cursor-pointer rounded-lg border border-white/[0.1] px-2.5 py-2 text-[11px] font-semibold text-discord-text-normal transition hover:bg-white/[0.06]">{iconUploading ? "Enviando…" : selectedRole.iconUrl ? "Trocar" : "Enviar imagem"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={iconUploading} onChange={handleSelectedRoleIconChange}/></label>{selectedRole.iconUrl && <button type="button" disabled={iconUploading} onClick={() => void removeSelectedRoleIcon()} className="rounded-lg p-2 text-discord-text-muted transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50" aria-label="Remover ícone do cargo"><Trash2 size={14}/></button>}</div>}
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-discord-bg-primary p-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-discord-bg-secondary text-discord-text-muted">{selectedRole.insigniaUrl ? <img src={selectedRole.insigniaUrl} alt="" className="h-full w-full object-contain"/> : <ShieldCheck size={18}/>}</span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-discord-text-normal">Insígnia do cargo</span><span className="mt-0.5 block text-[11px] leading-4 text-discord-text-muted">Aparece após o nome do cargo no perfil e antes do título na lista · até 5 MB</span></span>
                {canEdit && !selectedRole.is_default && <div className="flex shrink-0 items-center gap-2"><label className="cursor-pointer rounded-lg border border-white/[0.1] px-2.5 py-2 text-[11px] font-semibold text-discord-text-normal transition hover:bg-white/[0.06]">{insigniaUploading ? "Enviando…" : selectedRole.insigniaUrl ? "Trocar" : "Enviar"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={insigniaUploading} onChange={handleSelectedRoleInsigniaChange}/></label>{selectedRole.insigniaUrl && <button type="button" disabled={insigniaUploading} onClick={() => void removeSelectedRoleInsignia()} className="rounded-lg p-2 text-discord-text-muted transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50" aria-label="Remover insígnia do cargo"><Trash2 size={14}/></button>}</div>}
              </div>
              <div className="mt-5"><div className="mb-3 flex items-center gap-2 text-xs font-semibold text-discord-text-muted"><Palette size={15}/>Cor do cargo</div><div className="flex flex-wrap gap-2">{ROLE_COLORS.map((color) => <button key={color} type="button" disabled={!canEdit || selectedRole.is_default} aria-label={`Selecionar cor ${color}`} aria-pressed={roleColor.toLowerCase() === color.toLowerCase()} onClick={() => setRoleColor(color)} className={cn("grid h-8 w-8 place-items-center rounded-full border-2 transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50", roleColor.toLowerCase() === color.toLowerCase() ? "border-white" : "border-transparent")} style={{ backgroundColor: color }}>{roleColor.toLowerCase() === color.toLowerCase() && <Check size={15} className="text-white drop-shadow"/>}</button>)}</div></div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-discord-bg-secondary p-4"><p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-discord-text-muted">Prévia no mini perfil</p><RoleBadgeList roles={[{ id: selectedRole.id, name: roleName || selectedRole.name, color: roleColor, iconUrl: selectedRole.iconUrl, insigniaUrl: selectedRole.insigniaUrl }]} size="medium" layout="profile"/></div>
            {canEdit && !selectedRole.is_default && <button type="button" onClick={() => void saveRoleAppearance()} disabled={saving} className="rounded-lg bg-discord-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{saving ? "Salvando…" : "Salvar alterações"}</button>}
            {selectedRole.is_default && <p className="text-xs leading-5 text-discord-text-muted">O cargo padrão não pode ser renomeado ou removido. Suas permissões ainda podem ser configuradas na aba Permissões.</p>}
          </div>}

          {section === "permissions" && <div className="space-y-4">
            <div className="sticky top-0 z-10 rounded-xl border border-white/[0.08] bg-discord-bg-primary/95 p-3 shadow-lg backdrop-blur"><label className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-discord-bg-secondary px-3 py-2.5 text-discord-text-muted focus-within:border-discord-brand/70"><Search size={16}/><input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Buscar permissões" className="min-w-0 flex-1 bg-transparent text-sm text-discord-text-normal outline-none placeholder:text-discord-text-muted"/><kbd className="hidden rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] sm:inline">{PERMISSION_GROUPS.reduce((total, group) => total + group.bits.length, 0)} opções</kbd></label></div>
            {PERMISSION_GROUPS.map((group) => {
              const query = permissionSearch.trim().toLocaleLowerCase();
              const bits = group.bits.filter((bit) => `${PERMISSION_LABELS[bit]} ${PERMISSION_DESCRIPTIONS[bit]}`.toLocaleLowerCase().includes(query));
              if (!bits.length) return null;
              return <section key={group.label} className="overflow-hidden rounded-xl border border-white/[0.08] bg-discord-bg-secondary shadow-sm">
                <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-white/[0.025] px-4 py-3"><div><h4 className="text-sm font-semibold text-discord-header-primary">{group.label}</h4><p className="mt-0.5 text-[11px] text-discord-text-muted">{bits.length} permissão{bits.length === 1 ? "" : "ões"}</p></div><button type="button" disabled={!canEdit} onClick={() => void clearPermissionGroup(group.bits)} className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-discord-brand transition hover:bg-discord-brand/10 disabled:cursor-not-allowed disabled:opacity-40">Limpar permissões</button></header>
                <div className="divide-y divide-white/[0.06]">{bits.map((bit) => {
                  const checked = (toBigInt(selectedRole.permissions) & PERMISSIONS[bit]) !== 0n;
                  return <div key={bit} className="flex items-start gap-4 px-4 py-3.5 transition hover:bg-white/[0.025]">
                    <div className="min-w-0 flex-1"><h5 className="text-sm font-medium text-discord-text-normal">{PERMISSION_LABELS[bit]}</h5><p className="mt-1 max-w-2xl text-xs leading-5 text-discord-text-muted">{PERMISSION_DESCRIPTIONS[bit]}</p></div>
                    <button type="button" role="switch" aria-checked={checked} aria-label={`${PERMISSION_LABELS[bit]}: ${checked ? "ativada" : "desativada"}`} disabled={!canEdit} onClick={() => void togglePermission(bit)} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand focus-visible:ring-offset-2 focus-visible:ring-offset-discord-bg-secondary disabled:cursor-not-allowed disabled:opacity-50", checked ? "border-discord-brand bg-discord-brand" : "border-white/[0.16] bg-discord-bg-dark")}><span className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-[left]" style={{ left: checked ? "calc(100% - 17px)" : "1px" }}/></button>
                  </div>;
                })}</div>
              </section>;
            })}
            {PERMISSION_GROUPS.every((group) => group.bits.every((bit) => !`${PERMISSION_LABELS[bit]} ${PERMISSION_DESCRIPTIONS[bit]}`.toLocaleLowerCase().includes(permissionSearch.trim().toLocaleLowerCase()))) && <div className="rounded-xl border border-white/[0.08] bg-discord-bg-secondary px-4 py-10 text-center"><Search className="mx-auto h-5 w-5 text-discord-text-muted"/><p className="mt-2 text-sm font-medium text-discord-text-normal">Nenhuma permissão encontrada</p><p className="mt-1 text-xs text-discord-text-muted">Tente buscar por outro nome ou descrição.</p></div>}
          </div>}

          {section === "members" && <div className="space-y-4"><div className="rounded-xl border border-white/[0.07] bg-discord-bg-secondary p-4"><h4 className="text-sm font-semibold text-discord-header-primary">Membros com este cargo</h4><p className="mt-1 text-xs text-discord-text-muted">Adicione ou remova o cargo das pessoas do servidor.</p>{currentRoleMembers.length === 0 ? <p className="mt-4 rounded-lg bg-discord-bg-primary p-3 text-xs text-discord-text-muted">Ninguém recebeu este cargo ainda.</p> : <div className="mt-3 space-y-1">{currentRoleMembers.map((member) => <div key={member.user_id} className="flex items-center gap-3 rounded-lg bg-discord-bg-primary px-3 py-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-discord-brand/20 text-xs font-bold text-discord-brand">{(member.profiles?.display_name || member.profiles?.username || "?")[0]?.toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm text-discord-text-normal">{member.profiles?.display_name || member.profiles?.username || "Membro"}<span className="ml-2 text-xs text-discord-text-muted">@{member.profiles?.username || ""}</span></span>{canEdit && !selectedRole.is_default && <button type="button" onClick={() => void toggleMemberRole(member, false)} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10">Remover cargo</button>}</div>)}</div>}</div>
            {canEdit && !selectedRole.is_default && <div className="rounded-xl border border-white/[0.07] bg-discord-bg-secondary p-4"><h4 className="text-sm font-semibold text-discord-header-primary">Adicionar membros</h4><label className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-discord-bg-primary px-3 py-2 text-discord-text-muted"><Search size={15}/><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar pessoa no servidor" className="min-w-0 flex-1 bg-transparent text-sm text-discord-text-normal outline-none"/></label><div className="mt-2 max-h-44 space-y-1 overflow-y-auto">{availableMembers.slice(0, 12).map((member) => <div key={member.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]"><span className="min-w-0 flex-1 truncate text-sm text-discord-text-normal">{member.profiles?.display_name || member.profiles?.username || "Membro"}</span><button type="button" onClick={() => void toggleMemberRole(member, true)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-discord-brand hover:bg-discord-brand/10">Adicionar</button></div>)}{availableMembers.length === 0 && <p className="px-2 py-3 text-xs text-discord-text-muted">Não há outros membros para adicionar.</p>}</div></div>}</div>}
        </section> : <div className="grid flex-1 place-items-center p-8 text-center text-sm text-discord-text-muted">Crie ou selecione um cargo para editar.</div>}
      </div>
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
      .select("id, name, color, is_default")
      .eq("server_id", serverId);

    setRoles((allRoles ?? []).filter((role: any) => !role.is_default));
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
    const { error } = await supabase.rpc("moderate_server_member", {
      p_server_id: serverId,
      p_user_id: userId,
      p_action: "kick",
      p_reason: null,
    });
    if (error) { await dialogs.notify({ title: "Não foi possível expulsar", message: error.message }); return; }
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
    const { error } = await supabase.rpc("moderate_server_member", {
      p_server_id: serverId,
      p_user_id: userId,
      p_action: "ban",
      p_reason: reason,
    });
    if (error) { await dialogs.notify({ title: "Não foi possível banir", message: error.message }); return; }
    await load();
    onChanged();
  }

  async function toggleRole(userId: string, roleId: string, has: boolean) {
    const { error } = await supabase.rpc("assign_server_member_role", { p_server_id: serverId, p_user_id: userId, p_role_id: roleId, p_assign: !has });
    if (error) { await dialogs.notify({ title: "Não foi possível alterar o cargo", message: error.message }); return; }
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
