"use client";

import { useEffect, useState } from "react";
import { X, Trash2, Plus, Copy, Search, Users, Eye, Pencil, ShieldCheck, Palette, Check, GripVertical, Image as ImageIcon, ImagePlus, Activity, AppWindow, Ban, FolderTree, Hash, Link2, Lock, MessageSquare, Music2, Puzzle, ScrollText, Server, Shield, Smile, Sparkles, Sticker, Tag, Volume2, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useDialogs } from "@/components/DialogProvider";
import { RoleBadgeList, RoleIcon } from "@/components/RoleBadgeList";
import { ServerInviteCard } from "@/components/ServerInviteCard";
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

type Tab = "geral" | "tag" | "engajamento" | "impulso" | "emoji" | "stickers" | "soundboard" | "cargos" | "canais" | "membros" | "convites" | "acesso" | "integracoes" | "apps" | "seguranca" | "auditoria" | "banimentos" | "automod" | "comunidade" | "mensagens" | "modelo";

const SETTINGS_GROUPS: { title: string; items: { id: Tab; label: string; icon: LucideIcon }[] }[] = [
  { title: "Servidor", items: [
    { id: "geral", label: "Perfil do servidor", icon: Server },
    { id: "tag", label: "Tag do servidor", icon: Tag },
    { id: "engajamento", label: "Engajamento", icon: Activity },
    { id: "impulso", label: "Vantagens de impulso", icon: Sparkles },
  ] },
  { title: "Expressões", items: [
    { id: "emoji", label: "Emoji", icon: Smile },
    { id: "stickers", label: "Figurinhas", icon: Sticker },
    { id: "soundboard", label: "Painel de efeitos sonoros", icon: Music2 },
  ] },
  { title: "Pessoas", items: [
    { id: "membros", label: "Membros", icon: Users },
    { id: "cargos", label: "Cargos", icon: Shield },
    { id: "convites", label: "Convites", icon: Link2 },
    { id: "acesso", label: "Acesso", icon: Lock },
  ] },
  { title: "Apps", items: [
    { id: "integracoes", label: "Integrações", icon: Puzzle },
    { id: "apps", label: "Diretório de apps", icon: AppWindow },
  ] },
  { title: "Moderação", items: [
    { id: "seguranca", label: "Configurações de segurança", icon: ShieldCheck },
    { id: "auditoria", label: "Registro de auditoria", icon: ScrollText },
    { id: "banimentos", label: "Banimentos", icon: Ban },
    { id: "automod", label: "AutoMod", icon: Sparkles },
  ] },
  { title: "Comunidade", items: [
    { id: "mensagens", label: "Mensagens do sistema", icon: MessageSquare },
    { id: "comunidade", label: "Habilitar comunidade", icon: Users },
    { id: "modelo", label: "Modelo do servidor", icon: FolderTree },
  ] },
  { title: "Organização", items: [
    { id: "canais", label: "Canais e categorias", icon: Hash },
  ] },
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
        <aside className="hidden w-[min(272px,38vw)] shrink-0 flex-col bg-discord-bg-darkest p-3 sm:flex sm:p-4">
          <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
            <p className="truncate text-sm font-bold text-white">{serverName}</p>
            <p className="mt-0.5 text-[11px] text-discord-text-muted">Configurações do servidor</p>
          </div>
          <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {SETTINGS_GROUPS.map((group) => (
              <section key={group.title}>
                <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[.16em] text-discord-text-muted/70">{group.title}</p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button key={item.id} onClick={() => setTab(item.id)} className={cn("mb-0.5 flex w-full items-center gap-2.5 rounded-xl border-l-[3px] px-2.5 py-2 text-left text-[13px] transition", active ? "border-white bg-white/[0.08] text-white" : "border-transparent text-discord-text-muted hover:bg-white/[0.04] hover:text-discord-text-normal")}>
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "opacity-70")} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </section>
            ))}
          </nav>
          <button onClick={onClose} className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-2.5 text-sm text-discord-text-muted transition hover:bg-white/[0.05] hover:text-white"><X className="h-4 w-4"/>Fechar configurações</button>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3 sm:mb-5">
            <div className="min-w-0 flex-1">
              <span className="hidden text-xs font-semibold text-discord-text-muted sm:block">{SETTINGS_GROUPS.flatMap((group) => group.items).find((item) => item.id === tab)?.label}</span>
              <select value={tab} onChange={(event) => setTab(event.target.value as Tab)} aria-label="Seção das configurações do servidor" className="settings-field h-11 w-full min-w-0 font-semibold text-discord-header-primary sm:hidden">
                {SETTINGS_GROUPS.map((group) => <optgroup key={group.title} label={group.title}>{group.items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}
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
              currentUserId={currentUserId}
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
          {tab === "mensagens" && <ServerPreferencesPanel serverId={serverId} section="system" canManage={isOwner || perms.manageGuild} onAudit={onAudit}/>}
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
  currentUserId,
  canEdit,
  onChanged,
  isOwner,
  onDeleted,
}: {
  serverId: string;
  serverName: string;
  currentUserId: string;
  canEdit: boolean;
  onChanged: () => void;
  isOwner: boolean;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [name, setName] = useState(serverName);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [bannerReady, setBannerReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("servers").select("icon_url, banner_url, created_at").eq("id", serverId).maybeSingle();
      if (cancelled) return;
      if (error) {
        setBannerReady(false);
        const fallback = await supabase.from("servers").select("icon_url, created_at").eq("id", serverId).maybeSingle();
        if (!cancelled && fallback.data) {
          setIconUrl((fallback.data.icon_url as string | null) ?? null);
          setCreatedAt((fallback.data.created_at as string | null) ?? null);
        }
        return;
      }
      setBannerReady(true);
      setIconUrl((data?.icon_url as string | null) ?? null);
      setBannerUrl((data?.banner_url as string | null) ?? null);
      setCreatedAt((data?.created_at as string | null) ?? null);
      const { data: memberRows, error: memberError } = await supabase.from("members").select("user_id, profiles(status)").eq("server_id", serverId);
      if (cancelled || memberError || !memberRows) return;
      const rows = memberRows as { profiles?: { status?: string | null } | { status?: string | null }[] | null }[];
      setMemberCount(rows.length);
      setOnlineCount(rows.filter((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return profile?.status === "online" || profile?.status === "idle" || profile?.status === "dnd";
      }).length);
    })();
    return () => { cancelled = true; };
  }, [serverId, supabase]);

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
    const nextIconUrl = supabase.storage.from("server-icons").getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await supabase.from("servers").update({ icon_url: nextIconUrl }).eq("id", serverId);
    if (updateError) { await dialogs.notify({ title: "Falha ao salvar ícone", message: updateError.message }); return; }
    setIconUrl(nextIconUrl);
    onChanged();
  }

  async function persistBanner(nextBannerUrl: string | null) {
    const { error } = await supabase.rpc("set_server_banner", { p_server_id: serverId, p_banner_url: nextBannerUrl });
    if (!error) return null;
    const fallback = await supabase.from("servers").update({ banner_url: nextBannerUrl }).eq("id", serverId);
    return fallback.error?.message || error.message;
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.currentTarget.value = "";
    if (!file.type.startsWith("image/")) { await dialogs.notify({ title: "Arquivo inválido", message: "Escolha um arquivo de imagem." }); return; }
    if (file.size > 8 * 1024 * 1024) { await dialogs.notify({ title: "Imagem muito grande", message: "O banner deve ter no máximo 8 MB." }); return; }
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${serverId}/${currentUserId}/banner/${crypto.randomUUID()}.${extension}`;
    setBannerSaving(true);
    const { error } = await supabase.storage.from("server-assets").upload(path, file, { upsert: false, contentType: file.type });
    if (error) {
      setBannerSaving(false);
      await dialogs.notify({ title: "Falha no upload", message: error.message });
      return;
    }
    const nextBannerUrl = supabase.storage.from("server-assets").getPublicUrl(path).data.publicUrl;
    const saveError = await persistBanner(nextBannerUrl);
    setBannerSaving(false);
    if (saveError) {
      await supabase.storage.from("server-assets").remove([path]);
      setBannerReady(false);
      await dialogs.notify({ title: "Falha ao salvar o banner", message: `${saveError} Se a coluna ainda não existe, execute db/server_banner_invite.sql no SQL Editor do Supabase.` });
      return;
    }
    setBannerUrl(nextBannerUrl);
    setBannerReady(true);
    onChanged();
  }

  async function handleRemoveBanner() {
    setBannerSaving(true);
    const saveError = await persistBanner(null);
    setBannerSaving(false);
    if (saveError) {
      await dialogs.notify({ title: "Falha ao remover o banner", message: saveError });
      return;
    }
    setBannerUrl(null);
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
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-discord-text-muted">Servidor</p>
        <h2 className="mt-1 text-2xl font-bold text-discord-header-primary">Perfil do servidor</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-discord-text-muted">O nome, o ícone e o banner aparecem na barra lateral e no cartão do convite.</p>
      </header>

      <section className="rounded-2xl border border-white/[0.08] bg-discord-bg-primary p-4 shadow-lg shadow-black/10 sm:p-5">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
          <div className="relative h-32 bg-[#4f3d86]">
            {bannerUrl ? <img src={bannerUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-r from-[#6a4cc4] via-[#7a5af8] to-[#9b6dff]" />}
            {canEdit && (
              <div className="absolute bottom-3 right-3 flex gap-2">
                <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/85", bannerSaving && "pointer-events-none opacity-60")}>
                  <input type="file" accept="image/gif,image/*" className="hidden" disabled={bannerSaving} onChange={(event) => void handleBannerUpload(event)} />
                  <ImagePlus className="h-3.5 w-3.5" />
                  {bannerSaving ? "Enviando..." : bannerUrl ? "Trocar banner" : "Enviar banner"}
                </label>
                {bannerUrl && (
                  <button type="button" disabled={bannerSaving} onClick={() => void handleRemoveBanner()} className="rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/85 disabled:opacity-60">
                    Remover
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="px-3 py-2 text-xs text-discord-text-muted">Banner do convite · PNG, JPG ou GIF · até 8 MB. Uma imagem larga fica melhor.</p>
        </div>
        {!bannerReady && (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">O banner ainda não está no banco. Execute <span className="font-mono">db/server_banner_invite.sql</span> no SQL Editor do Supabase.</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-2xl font-bold text-white">
            {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-cover" /> : serverName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-discord-header-primary">Ícone do servidor</h3>
            <p className="mt-1 text-xs leading-5 text-discord-text-muted">PNG, JPG ou GIF animado · até 8 MB</p>
            <label className={cn("mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-discord-text-normal transition hover:bg-white/[0.08]", canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-50")}>
              <input type="file" accept="image/gif,image/*" className="hidden" disabled={!canEdit} onChange={handleIconUpload} />
              <ImagePlus className="h-3.5 w-3.5" />
              {iconUrl ? "Trocar imagem" : "Enviar imagem"}
            </label>
          </div>
        </div>

        <label className="mt-5 block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">
          Nome do servidor
          <input
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            className="settings-field disabled:opacity-60"
          />
        </label>

        {canEdit && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSaveName}
              disabled={saving || !name.trim()}
              className="rounded-xl bg-theme-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        )}
        {!canEdit && (
          <p className="mt-4 text-xs text-discord-text-muted">Você não tem permissão para editar as informações do servidor.</p>
        )}

        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">Prévia do convite</p>
          <ServerInviteCard
            code="preview"
            previewOnly
            preview={{ name: name.trim() || serverName, iconUrl, bannerUrl, createdAt, online: onlineCount, members: memberCount }}
          />
        </div>
      </section>

      {isOwner && (
        <section className="mt-5 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-5">
          <h3 className="font-semibold text-rose-200">Zona de perigo</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-discord-text-muted">Excluir o servidor remove os canais, as mensagens e os membros ligados a ele.</p>
          <button
            type="button"
            onClick={() => void handleDeleteServer()}
            disabled={deleting}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
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
          <nav className="settings-segment mb-5">{([ ["display", "Exibição", Eye], ["permissions", "Permissões", ShieldCheck], ["members", `Membros (${selectedRole.memberCount})`, Users] ] as const).map(([id, label, Icon]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)} className="inline-flex items-center gap-2"><Icon size={14}/>{label}</button>)}</nav>
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

  const looseChannels = channels.filter((channel) => !channel.category_id || !categories.some((category) => category.id === channel.category_id));
  const groups = [
    ...categories.map((category) => ({ ...category, channels: channels.filter((channel) => channel.category_id === category.id) })),
    ...(looseChannels.length ? [{ id: "loose", name: "Sem categoria", channels: looseChannels, loose: true }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-discord-text-muted">Organização</p>
        <h2 className="mt-1 text-2xl font-bold text-discord-header-primary">Canais e categorias</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-discord-text-muted">Renomeie ou remova canais sem sair da lista do servidor.</p>
      </header>
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
          <Hash className="mx-auto h-5 w-5 text-discord-text-muted" />
          <p className="mt-3 font-semibold text-discord-header-primary">Nenhum canal ainda</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-discord-text-muted">Os canais criados no servidor aparecem agrupados por categoria.</p>
        </div>
      ) : groups.map((group) => (
        <section key={group.id} className="mb-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-discord-bg-primary">
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-discord-text-muted">{group.name}</p>
            {canEdit && !("loose" in group) && (
              <div className="flex items-center gap-1">
                <button onClick={() => handleRenameCategory(group.id, group.name)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-discord-text-muted transition hover:bg-white/[0.06] hover:text-white">Renomear</button>
                <button onClick={() => handleDeleteCategory(group.id)} aria-label={`Apagar categoria ${group.name}`} className="rounded-lg p-2 text-discord-text-muted transition hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </header>
          <div className="divide-y divide-white/[0.05]">
            {group.channels.length === 0 ? <p className="px-4 py-4 text-sm text-discord-text-muted">Nenhum canal nesta categoria.</p> : group.channels.map((channel: { id: string; name: string; type: string }) => (
              <div key={channel.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-discord-text-muted">
                  {channel.type === "text" ? <Hash className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-discord-header-primary">{channel.name}</p>
                  <p className="text-[11px] text-discord-text-muted">{channel.type === "text" ? "Canal de texto" : "Canal de voz"}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleRenameChannel(channel.id, channel.name)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-discord-text-muted transition hover:bg-white/[0.06] hover:text-white">Renomear</button>
                    <button onClick={() => handleDeleteChannel(channel.id)} aria-label={`Apagar canal ${channel.name}`} className="rounded-lg p-2 text-discord-text-muted transition hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
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
    const url = `${window.location.origin.replace(/\/$/, "")}/${code}`;
    void navigator.clipboard.writeText(url);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-discord-text-muted">Pessoas</p>
          <h2 className="mt-1 text-2xl font-bold text-discord-header-primary">Convites</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-discord-text-muted">O link fica no formato do site, com o código no final. No chat ele abre o cartão do servidor.</p>
        </div>
        {canCreate && (
          <button onClick={handleCreateInvite} className="inline-flex items-center gap-2 rounded-xl bg-theme-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110">
            <Plus className="h-4 w-4" /> Gerar convite
          </button>
        )}
      </header>
      {invites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
          <Link2 className="mx-auto h-5 w-5 text-discord-text-muted" />
          <p className="mt-3 font-semibold text-discord-header-primary">Nenhum convite ativo</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-discord-text-muted">Os códigos criados ficam nesta lista, com a contagem de usos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invites.map((inv) => (
            <article key={inv.code} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-discord-bg-primary px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-discord-text-muted"><Link2 className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold tracking-wide text-discord-header-primary">/{inv.code}</p>
                <p className="mt-0.5 text-xs text-discord-text-muted">{inv.uses} usos{inv.max_uses > 0 ? ` de ${inv.max_uses}` : " · sem limite"}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleCopy(inv.code)} aria-label={`Copiar convite ${inv.code}`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-discord-text-muted transition hover:bg-white/[0.06] hover:text-white"><Copy className="h-3.5 w-3.5" />Copiar</button>
                <button onClick={() => handleRevoke(inv.code)} aria-label={`Revogar convite ${inv.code}`} className="rounded-lg p-2 text-discord-text-muted transition hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
        </div>
      )}
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
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-discord-text-muted">Pessoas</p>
        <h2 className="mt-1 text-2xl font-bold text-discord-header-primary">Membros</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-discord-text-muted">Atribua cargos e aplique moderação sem abrir o perfil de cada pessoa.</p>
      </header>
      {members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
          <Users className="mx-auto h-5 w-5 text-discord-text-muted" />
          <p className="mt-3 font-semibold text-discord-header-primary">Nenhum membro encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const label = member.profiles?.display_name || member.profiles?.username || "Membro";
            return (
              <article key={member.user_id} className="rounded-2xl border border-white/[0.08] bg-discord-bg-primary p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-sm font-bold text-white">{label.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-discord-header-primary">{label}</p>
                    <p className="truncate text-xs text-discord-text-muted">@{member.profiles?.username || "sem-usuario"}</p>
                  </div>
                  {member.user_id !== currentUserId && (
                    <div className="flex gap-1">
                      {canKick && <button onClick={() => handleKick(member.user_id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-discord-text-muted transition hover:bg-white/[0.06] hover:text-white">Expulsar</button>}
                      {canBan && <button onClick={() => handleBan(member.user_id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/10">Banir</button>}
                    </div>
                  )}
                </div>
                {canAssignRoles && roles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {roles.map((role) => {
                      const has = member.roleIds.includes(role.id);
                      return (
                        <button
                          key={role.id}
                          onClick={() => toggleRole(member.user_id, role.id, has)}
                          className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold transition", has ? "border-transparent text-white" : "border-white/10 bg-transparent text-discord-text-muted hover:border-white/25 hover:text-white")}
                          style={has ? { backgroundColor: role.color || "#5865f2" } : undefined}
                        >
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
