"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDialogs } from "@/components/DialogProvider";

type Section = "tag" | "access" | "security" | "automod" | "community";
type Preferences = {
  tag: string;
  description: string;
  communityEnabled: boolean;
  verificationLevel: "none" | "low" | "medium" | "high";
  contentFilter: "off" | "members" | "all";
  defaultNotifications: "all" | "mentions";
  autoModEnabled: boolean;
  mentionLimit: number;
  blockInviteLinks: boolean;
  slowmodeSeconds: number;
};

const DEFAULTS: Preferences = {
  tag: "",
  description: "",
  communityEnabled: false,
  verificationLevel: "low",
  contentFilter: "members",
  defaultNotifications: "all",
  autoModEnabled: true,
  mentionLimit: 5,
  blockInviteLinks: true,
  slowmodeSeconds: 0,
};

const SECTION_INFO: Record<Section, { title: string; description: string }> = {
  tag: { title: "Tag do servidor", description: "Defina uma identificação curta para ajudar as pessoas a reconhecer seu servidor." },
  access: { title: "Acesso", description: "Controle o nível mínimo de verificação e o filtro aplicado a novos membros." },
  security: { title: "Configurações de segurança", description: "Ajuste as proteções padrão para a comunidade." },
  automod: { title: "AutoMod", description: "Reduza spam, menções excessivas e convites externos nos canais de texto." },
  community: { title: "Comunidade", description: "Organize o servidor como uma comunidade e escolha o canal de entrada." },
};

export function ServerPreferencesPanel({ serverId, section, canManage, onAudit }: {
  serverId: string;
  section: Section;
  canManage: boolean;
  onAudit: (action: string, target?: string, details?: Record<string, unknown>) => Promise<void>;
}) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [initial, setInitial] = useState<Preferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const [{ data, error: prefError }, { data: channelRows }] = await Promise.all([
        supabase.from("server_preferences").select("settings").eq("server_id", serverId).maybeSingle(),
        supabase.from("channels").select("id,name").eq("server_id", serverId).eq("type", "text").order("position"),
      ]);
      if (cancelled) return;
      if (prefError) setError(prefError.message);
      const next = { ...DEFAULTS, ...((data?.settings ?? {}) as Partial<Preferences>) };
      setPrefs(next);
      setInitial(next);
      setChannels(channelRows ?? []);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [serverId, supabase]);

  const changed = useMemo(() => JSON.stringify(prefs) !== JSON.stringify(initial), [prefs, initial]);
  const info = SECTION_INFO[section];

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error: saveError } = await supabase.from("server_preferences").upsert({
      server_id: serverId,
      settings: prefs,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }, { onConflict: "server_id" });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setInitial(prefs);
    await onAudit(`settings.${section}`, info.title, { changedFields: Object.keys(prefs).filter((key) => (prefs as any)[key] !== (initial as any)[key]) });
    await dialogs.notify({ title: "Configurações salvas", message: `${info.title} foi atualizado.` });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6 border-b border-white/[0.08] pb-5">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-discord-brand">Configurações do servidor</p>
        <h2 className="mt-1 text-2xl font-bold text-discord-header-primary">{info.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-discord-text-muted">{info.description}</p>
      </header>
      {loading ? <p className="py-8 text-sm text-discord-text-muted">Carregando preferências…</p> : (
        <div className="space-y-5">
          {section === "tag" && <Card title="Identidade" description="A tag aparece junto ao nome do servidor e fica disponível no convite.">
            <Field label="Tag curta" hint={`${prefs.tag.length}/6`}><input value={prefs.tag} maxLength={6} disabled={!canManage} onChange={(event) => update("tag", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="SEKAI" className={inputClass}/></Field>
            <Field label="Descrição" hint={`${prefs.description.length}/180`}><textarea value={prefs.description} maxLength={180} rows={3} disabled={!canManage} onChange={(event) => update("description", event.target.value)} placeholder="O que as pessoas podem encontrar neste servidor?" className={inputClass}/></Field>
            <div className="rounded-lg bg-discord-bg-secondary px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-discord-text-muted">Prévia</p><p className="mt-1 font-semibold text-white">{prefs.tag || "SUA TAG"} <span className="font-normal text-discord-text-muted">· {prefs.description || "Descrição do servidor"}</span></p></div>
          </Card>}

          {(section === "access" || section === "security") && <>
            <Card title="Verificação de membros" description="Dificulte a entrada de contas recém-criadas e reduza abuso por convites públicos.">
              <Field label="Nível de verificação"><select value={prefs.verificationLevel} disabled={!canManage} onChange={(event) => update("verificationLevel", event.target.value as Preferences["verificationLevel"])} className={inputClass}><option value="none">Nenhum requisito</option><option value="low">Conta com e-mail confirmado</option><option value="medium">Conta com e-mail e tempo mínimo</option><option value="high">Verificação reforçada</option></select></Field>
              <Field label="Filtro de conteúdo"><select value={prefs.contentFilter} disabled={!canManage} onChange={(event) => update("contentFilter", event.target.value as Preferences["contentFilter"])} className={inputClass}><option value="off">Desativado</option><option value="members">Novos membros</option><option value="all">Todos os membros</option></select></Field>
              <Field label="Notificações padrão"><select value={prefs.defaultNotifications} disabled={!canManage} onChange={(event) => update("defaultNotifications", event.target.value as Preferences["defaultNotifications"])} className={inputClass}><option value="all">Todas as mensagens</option><option value="mentions">Somente menções</option></select></Field>
            </Card>
            {section === "security" && <Card title="Proteção contra spam" description="As regras abaixo são aplicadas aos novos envios de texto do Sekai."><Toggle checked={prefs.autoModEnabled} disabled={!canManage} onChange={(value) => update("autoModEnabled", value)} title="Ativar AutoMod" text="Bloquear padrões comuns de spam antes de publicar a mensagem."/><Toggle checked={prefs.blockInviteLinks} disabled={!canManage} onChange={(value) => update("blockInviteLinks", value)} title="Bloquear convites externos" text="Impede links de convite de outros servidores nos canais deste servidor."/></Card>}
          </>}

          {section === "automod" && <>
            <Card title="Regras automáticas" description="As regras também são verificadas pela política de envio do banco após executar a migração de integridade atualizada.">
              <Toggle checked={prefs.autoModEnabled} disabled={!canManage} onChange={(value) => update("autoModEnabled", value)} title="Ativar AutoMod" text="Ative ou pause todas as regras abaixo."/>
              <Field label="Limite de menções por mensagem" hint="0 desativa o limite"><input type="number" min={0} max={50} value={prefs.mentionLimit} disabled={!canManage || !prefs.autoModEnabled} onChange={(event) => update("mentionLimit", Math.max(0, Math.min(50, Number(event.target.value) || 0)))} className={inputClass}/></Field>
              <Toggle checked={prefs.blockInviteLinks} disabled={!canManage || !prefs.autoModEnabled} onChange={(value) => update("blockInviteLinks", value)} title="Bloquear links de convite" text="Bloqueia convites de servidor detectados no texto."/>
              <Field label="Modo lento padrão" hint="segundos por mensagem"><select value={prefs.slowmodeSeconds} disabled={!canManage} onChange={(event) => update("slowmodeSeconds", Number(event.target.value))} className={inputClass}>{[0, 3, 5, 10, 15, 30, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds === 0 ? "Desativado" : `${seconds} segundos`}</option>)}</select></Field>
            </Card>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-5 text-amber-100/80">Mensagens rejeitadas continuam aparecendo para o remetente como um aviso e não são gravadas no canal.</div>
          </>}

          {section === "community" && <>
            <Card title="Configuração de comunidade" description="Ative recursos de comunidade e escolha o canal padrão de boas-vindas.">
              <Toggle checked={prefs.communityEnabled} disabled={!canManage} onChange={(value) => update("communityEnabled", value)} title="Habilitar comunidade" text="Exibe o servidor como uma comunidade com regras de segurança e boas-vindas."/>
              <Field label="Canal de boas-vindas"><select value={(prefs as any).welcomeChannelId ?? ""} disabled={!canManage || !prefs.communityEnabled} onChange={(event) => setPrefs((current) => ({ ...current, welcomeChannelId: event.target.value || null } as Preferences))} className={inputClass}><option value="">Sem canal selecionado</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></Field>
              <Field label="Descrição da comunidade"><textarea value={prefs.description} maxLength={180} rows={3} disabled={!canManage || !prefs.communityEnabled} onChange={(event) => update("description", event.target.value)} placeholder="Apresente sua comunidade" className={inputClass}/></Field>
            </Card>
          </>}

          {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
          {canManage && <div className="sticky bottom-0 flex justify-end border-t border-white/[0.08] bg-discord-bg-secondary/95 py-4 backdrop-blur"><button onClick={() => { setPrefs(initial); setError(""); }} disabled={!changed || saving} className="mr-2 rounded-lg px-4 py-2 text-sm text-discord-text-muted hover:bg-white/5 disabled:opacity-40">Descartar</button><button onClick={() => void save()} disabled={!changed || saving} className="rounded-lg bg-discord-brand px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-45">{saving ? "Salvando…" : "Salvar alterações"}</button></div>}
          {!canManage && <p className="text-xs text-discord-text-muted">Você precisa da permissão Gerenciar servidor para editar esta área.</p>}
        </div>
      )}
    </div>
  );
}

export function ServerMetricsPanel({ serverId, serverName }: { serverId: string; serverName: string }) {
  const supabase = createClient();
  const [counts, setCounts] = useState({ members: 0, channels: 0, invites: 0, messages: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ count: members }, { count: channels }, { count: invites }, { data: channelRows }] = await Promise.all([
        supabase.from("members").select("user_id", { count: "exact", head: true }).eq("server_id", serverId),
        supabase.from("channels").select("id", { count: "exact", head: true }).eq("server_id", serverId),
        supabase.from("invites").select("code", { count: "exact", head: true }).eq("server_id", serverId),
        supabase.from("channels").select("id").eq("server_id", serverId),
      ]);
      const ids = (channelRows ?? []).map((row: any) => row.id);
      const { count: messages } = ids.length ? await supabase.from("messages").select("id", { count: "exact", head: true }).in("channel_id", ids) : { count: 0 };
      if (!cancelled) { setCounts({ members: members ?? 0, channels: channels ?? 0, invites: invites ?? 0, messages: messages ?? 0 }); setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [serverId, supabase]);
  return <div className="mx-auto max-w-3xl"><Header title="Engajamento" description={`Acompanhe a atividade de ${serverName} com dados reais do servidor.`}/>{loading ? <p className="text-sm text-discord-text-muted">Calculando…</p> : <div className="grid gap-3 sm:grid-cols-2">{[["Membros", counts.members], ["Canais", counts.channels], ["Convites", counts.invites], ["Mensagens", counts.messages]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/[0.08] bg-discord-bg-primary p-5"><p className="text-xs font-semibold uppercase tracking-wider text-discord-text-muted">{label}</p><p className="mt-3 text-3xl font-bold text-discord-header-primary">{value}</p></div>)}</div>}<div className="mt-5 rounded-xl border border-white/[0.08] p-4"><h3 className="font-semibold text-discord-header-primary">Vantagens de impulso</h3><p className="mt-2 text-sm leading-6 text-discord-text-muted">O Sekai ainda não processa impulsos ou pagamentos. As chamadas de voz usam o serviço LiveKit configurado pelo administrador do projeto.</p></div></div>;
}

export function ServerAssetsPanel({ serverId, currentUserId, kind, canManage, onAudit, onPlaySoundEffect }: { serverId: string; currentUserId: string; kind: "emoji" | "sticker" | "sound"; canManage: boolean; onAudit: (action: string, target?: string, details?: Record<string, unknown>) => Promise<void>; onPlaySoundEffect?: (serverId: string, sound: { id: string; name: string; asset_url: string }) => Promise<boolean> }) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [playbackNotice, setPlaybackNotice] = useState("");
  const labels = {
    emoji: ["Emojis", "Cadastre emojis Unicode ou imagens próprias para usar nas mensagens."],
    sticker: ["Figurinhas", "Gerencie imagens de figurinha disponíveis para a comunidade."],
    sound: ["Painel de efeitos sonoros", "Adicione sons ao servidor e transmita-os para as pessoas na chamada de voz."],
  } as const;

  async function load() {
    const { data, error: loadError } = await supabase.from("server_assets").select("id,name,asset_url,storage_path,created_at").eq("server_id", serverId).eq("kind", kind).order("created_at", { ascending: false });
    if (loadError) setError(loadError.message);
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { setLoading(true); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [serverId, kind]);

  async function addAsset(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    if (!cleanName) { setError("Escolha um nome válido para o recurso."); return; }
    setSaving(true); setError("");
    let assetUrl = emoji.trim();
    let storagePath: string | null = null;
    const uploadFile = kind !== "emoji" || !!file;
    if (uploadFile) {
      if (!file) { setError("Escolha um arquivo antes de adicionar."); setSaving(false); return; }
      const valid = kind === "sound" ? file.type.startsWith("audio/") : file.type.startsWith("image/");
      if (!valid || file.size > 8 * 1024 * 1024) {
        setError(kind === "sound" ? "Use um áudio de até 8 MB." : "Use uma imagem de até 8 MB.");
        setSaving(false);
        return;
      }
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      storagePath = `${serverId}/${currentUserId}/${kind}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("server-assets").upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) { setError(uploadError.message); setSaving(false); return; }
      assetUrl = supabase.storage.from("server-assets").getPublicUrl(storagePath).data.publicUrl;
    } else if (!assetUrl) {
      setError("Digite um emoji Unicode ou selecione uma imagem.");
      setSaving(false);
      return;
    }
    const { error: insertError } = await supabase.from("server_assets").insert({ server_id: serverId, kind, name: cleanName, asset_url: assetUrl, storage_path: storagePath, created_by: currentUserId });
    setSaving(false);
    if (insertError) {
      if (storagePath) await supabase.storage.from("server-assets").remove([storagePath]);
      setError(insertError.message); return;
    }
    setName(""); setEmoji(""); setFile(null);
    await onAudit(`asset.${kind}.create`, cleanName);
    await load();
  }

  async function playSound(row: any) {
    setPlayingId(row.id); setError(""); setPlaybackNotice("");
    try {
      const transmitted = await onPlaySoundEffect?.(serverId, { id: row.id, name: row.name, asset_url: row.asset_url });
      if (transmitted) {
        setPlaybackNotice(`“${row.name}” foi enviado para a chamada de voz.`);
      } else {
        const audio = new Audio(row.asset_url);
        audio.volume = 0.85;
        await audio.play();
        setPlaybackNotice("Prévia local. Para transmitir para outras pessoas, entre em uma chamada de voz deste servidor e use o soundboard.");
      }
      await onAudit("soundboard.play", row.name, { soundId: row.id });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : "Não foi possível reproduzir o efeito sonoro.");
    } finally {
      setPlayingId(null);
    }
  }

  async function removeAsset(row: any) {
    if (!await dialogs.confirm({ title: "Remover recurso", message: `Remover ${row.name} do servidor?`, confirmLabel: "Remover", danger: true })) return;
    const { error: deleteError } = await supabase.from("server_assets").delete().eq("id", row.id);
    if (deleteError) { setError(deleteError.message); return; }
    if (row.storage_path) await supabase.storage.from("server-assets").remove([row.storage_path]);
    await onAudit(`asset.${kind}.delete`, row.name);
    await load();
  }

  const fileAccept = kind === "sound" ? "audio/*" : "image/png,image/jpeg,image/webp,image/gif";
  const fileLabel = kind === "sound" ? "Arquivo de áudio" : kind === "sticker" ? "Imagem da figurinha" : "Imagem do emoji (opcional)";
  return (
    <div className="mx-auto max-w-3xl">
      <Header title={labels[kind][0]} description={labels[kind][1]} />
      {canManage && <form onSubmit={(event) => void addAsset(event)} className="mb-5 rounded-2xl border border-white/[0.08] bg-discord-bg-primary p-4 shadow-lg shadow-black/10">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome curto"><input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "sound" ? "ex: bankai" : "ex: festa"} className={inputClass} /></Field>
          {kind === "emoji" && <Field label="Emoji Unicode"><input value={emoji} onChange={(event) => setEmoji(event.target.value)} placeholder="🎉 (opcional se enviar imagem)" className={inputClass} /></Field>}
          <Field label={fileLabel}><input type="file" accept={fileAccept} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs text-discord-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" /></Field>
        </div>
        {kind === "sound" && <p className="mt-2 text-xs text-discord-text-muted">Entre em uma chamada de voz deste servidor para transmitir os sons. Fora da chamada, o botão toca apenas uma prévia local.</p>}
        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        {playbackNotice && <p role="status" className="mt-3 text-xs text-emerald-300">{playbackNotice}</p>}
        <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-theme-gradient px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-50">{saving ? "Adicionando…" : "Adicionar recurso"}</button>
      </form>}
      {error && !canManage && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
      {loading ? <p className="text-sm text-discord-text-muted">Carregando…</p> : rows.length === 0 ? <Empty title="Ainda não há recursos" text="Os recursos adicionados aparecerão aqui para gestão do servidor." /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => {
            const isImage = kind === "sticker" || (kind === "emoji" && /^https?:\/\//i.test(row.asset_url));
            return <article key={row.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.08] bg-discord-bg-primary p-3 shadow-sm">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-discord-bg-secondary text-2xl">
                {isImage ? <img src={row.asset_url} alt={row.name} className="h-full w-full object-contain" /> : kind === "emoji" ? row.asset_url : "♫"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-discord-header-primary">:{row.name}:</p>
                {kind === "sound" && <><p className="mt-1 text-[10px] text-discord-text-muted">Prévia local</p><audio controls src={row.asset_url} className="mt-1 h-8 max-w-full" /> </>}
              </div>
              {kind === "sound" && <button type="button" onClick={() => void playSound(row)} disabled={playingId !== null} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-theme-gradient px-3 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60" title="Transmitir na chamada de voz"><Play size={14} fill="currentColor" />{playingId === row.id ? "Enviando…" : "Usar na chamada"}<Volume2 size={14} /></button>}
              {canManage && <button type="button" onClick={() => void removeAsset(row)} className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">Remover</button>}
            </article>;
          })}
        </div>
      )}
    </div>
  );
}

export function ServerBansPanel({ serverId, canManage, onAudit }: { serverId: string; canManage: boolean; onAudit: (action: string, target?: string, details?: Record<string, unknown>) => Promise<void> }) {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  async function load() { const { data, error: loadError } = await supabase.from("guild_bans").select("user_id,reason,created_at,profiles(username,display_name)").eq("server_id", serverId).order("created_at", { ascending: false }); setRows(data ?? []); setError(loadError?.message ?? ""); }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [serverId]);
  async function unban(userId: string) { const { error: deleteError } = await supabase.from("guild_bans").delete().match({ server_id: serverId, user_id: userId }); if (deleteError) { setError(deleteError.message); return; } await onAudit("member.unban", userId); await load(); }
  return <div className="mx-auto max-w-3xl"><Header title="Banimentos" description="Revise os banimentos e permita que uma pessoa volte ao servidor."/>{error && <p className="mb-3 text-sm text-red-300">{error}</p>}{rows.length === 0 ? <Empty title="Nenhum banimento ativo" text="Quando alguém for banido, o registro e o motivo aparecerão nesta lista."/> : <div className="space-y-2">{rows.map((row) => <div key={row.user_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-discord-bg-primary p-4"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{row.profiles?.display_name || row.profiles?.username || row.user_id}</p><p className="mt-1 text-xs text-discord-text-muted">{row.reason || "Sem motivo informado"} · {new Date(row.created_at).toLocaleDateString("pt-BR")}</p></div>{canManage && <button onClick={() => void unban(row.user_id)} className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-discord-text-normal hover:bg-white/10">Desbanir</button>}</div>)}</div>}</div>;
}

export function ServerAuditPanel({ serverId, canView }: { serverId: string; canView: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { if (!canView) return; let cancelled = false; void (async () => { const { data, error: resultError } = await supabase.from("server_audit_logs").select("id,actor_id,action,target,details,created_at,profiles(username,display_name)").eq("server_id", serverId).order("created_at", { ascending: false }).limit(100); if (cancelled) return; setRows(data ?? []); setError(resultError?.message ?? ""); })(); return () => { cancelled = true; }; }, [serverId, supabase, canView]);
  const actionLabels: Record<string, string> = {
    "member.kick": "Membro expulso",
    "member.ban": "Membro banido",
    "member.role.add": "Cargo atribuído",
    "member.role.remove": "Cargo removido",
    "role.create": "Cargo criado",
    "role.update": "Cargo atualizado",
    "role.delete": "Cargo excluído",
    "role.permissions.update": "Permissões de cargo alteradas",
  };
  return <div className="mx-auto max-w-3xl"><Header title="Registro de auditoria" description="Ações administrativas recentes registradas no servidor."/>{!canView ? <Empty title="Sem permissão para visualizar" text="A permissão Ver registro de auditoria é necessária para abrir esta página."/> : error ? <p className="mb-3 text-sm text-red-300">{error}</p> : rows.length === 0 ? <Empty title="Sem atividades registradas" text="Alterações administrativas aparecerão aqui conforme forem feitas."/> : <div className="space-y-2">{rows.map((row) => <article key={row.id} className="rounded-xl border border-white/[0.08] bg-discord-bg-primary p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-discord-header-primary">{actionLabels[row.action] || row.action.replace(/[._]/g, " ")}</p><time className="text-xs text-discord-text-muted">{new Date(row.created_at).toLocaleString("pt-BR")}</time></div><p className="mt-1 text-sm text-discord-text-normal">{row.target || "Servidor"} <span className="text-discord-text-muted">por {row.profiles?.display_name || row.profiles?.username || "administrador"}</span></p>{row.details?.role_name && <p className="mt-1 text-xs text-discord-text-muted">Cargo: {row.details.role_name}</p>}{row.details?.reason && <p className="mt-1 text-xs text-discord-text-muted">Motivo: {row.details.reason}</p>}</article>)}</div>}</div>;
}

export function ServerTemplatePanel({ serverId, serverName }: { serverId: string; serverName: string }) {
  const supabase = createClient();
  const dialogs = useDialogs();
  const [busy, setBusy] = useState(false);
  async function exportTemplate() {
    setBusy(true);
    const [{ data: channels, error: channelsError }, { data: roles, error: rolesError }, { data: categories, error: categoriesError }] = await Promise.all([
      supabase.from("channels").select("name,type,position,category_id").eq("server_id", serverId).order("position"),
      supabase.from("roles").select("name,color,position,permissions,is_default").eq("server_id", serverId).order("position"),
      supabase.from("channel_categories").select("name,position").eq("server_id", serverId).order("position"),
    ]);
    setBusy(false);
    const error = channelsError || rolesError || categoriesError;
    if (error) { await dialogs.notify({ title: "Não foi possível exportar", message: error.message }); return; }
    const blob = new Blob([JSON.stringify({ format: "sekai-server-template", version: 1, name: serverName, exportedAt: new Date().toISOString(), categories, channels, roles }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${serverName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-template.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="mx-auto max-w-3xl"><Header title="Modelo do servidor" description="Exporte a estrutura do servidor para reutilizá-la como referência."/><Card title="Exportar estrutura" description="O arquivo contém categorias, canais e cargos. Ele não inclui membros, mensagens, credenciais nem convites."><button disabled={busy} onClick={() => void exportTemplate()} className="rounded-lg bg-discord-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Preparando arquivo…" : "Baixar modelo JSON"}</button></Card></div>;
}

export function ServerIntegrationPanel() {
  const rows = [
    { name: "LiveKit", detail: "Áudio, vídeo e compartilhamento de tela", ready: !!process.env.NEXT_PUBLIC_LIVEKIT_URL },
    { name: "Pusher", detail: "Presença e eventos em tempo real", ready: !!process.env.NEXT_PUBLIC_PUSHER_KEY },
    { name: "Supabase", detail: "Contas, mensagens, membros e armazenamento", ready: !!process.env.NEXT_PUBLIC_SUPABASE_URL },
  ];
  return <div className="mx-auto max-w-3xl"><Header title="Integrações" description="Serviços usados pelo Sekai. Credenciais secretas nunca são exibidas neste painel."/><div className="space-y-3">{rows.map((row) => <div key={row.name} className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-discord-bg-primary p-4"><span className={`h-2.5 w-2.5 rounded-full ${row.ready ? "bg-emerald-400" : "bg-amber-400"}`}/><div className="min-w-0 flex-1"><p className="font-semibold text-discord-header-primary">{row.name}</p><p className="text-xs text-discord-text-muted">{row.detail}</p></div><span className={`text-xs font-semibold ${row.ready ? "text-emerald-300" : "text-amber-200"}`}>{row.ready ? "Configurado" : "Pendente"}</span></div>)}</div><p className="mt-4 rounded-xl border border-white/[0.08] p-4 text-sm leading-6 text-discord-text-muted">Integrações são configuradas por quem mantém o projeto no Vercel. Esta tela mostra apenas se a variável pública existe; ela nunca mostra chaves privadas.</p></div>;
}

export function ServerDirectoryPanel() {
  return <div className="mx-auto max-w-3xl"><Header title="Diretório de apps" description="Conecte automações e serviços ao servidor."/><Empty title="O catálogo de aplicativos ainda não está conectado" text="O Sekai não possui um diretório de bots de terceiros. As integrações disponíveis ficam na página Integrações e são configuradas pelo administrador do projeto."/></div>;
}

function Header({ title, description }: { title: string; description: string }) { return <header className="mb-6 border-b border-white/[0.08] pb-5"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-discord-brand">Configurações do servidor</p><h2 className="mt-1 text-2xl font-bold text-discord-header-primary">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-discord-text-muted">{description}</p></header>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center"><p className="font-semibold text-discord-header-primary">{title}</p><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-discord-text-muted">{text}</p></div>; }
function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="rounded-xl border border-white/[0.08] bg-discord-bg-primary p-4 sm:p-5"><h3 className="font-semibold text-discord-header-primary">{title}</h3><p className="mb-4 mt-1 text-xs leading-5 text-discord-text-muted">{description}</p>{children}</section>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="mb-4 block last:mb-0"><span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">{label}{hint && <span className="font-normal normal-case">{hint}</span>}</span>{children}</label>; }
function Toggle({ checked, disabled, onChange, title, text }: { checked: boolean; disabled: boolean; onChange: (value: boolean) => void; title: string; text: string }) { return <div className="flex items-center gap-4 border-t border-white/[0.06] py-4 first:border-0 first:pt-0"><div className="flex-1"><p className="text-sm font-medium text-discord-text-normal">{title}</p><p className="mt-1 text-xs leading-5 text-discord-text-muted">{text}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-discord-brand" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`}/></button></div>; }
const inputClass = "mt-2 w-full rounded-lg border border-white/10 bg-discord-bg-secondary px-3 py-2.5 text-sm text-discord-text-normal outline-none transition placeholder:text-discord-text-muted/60 focus:border-discord-brand/70 disabled:opacity-55";
