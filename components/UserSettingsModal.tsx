"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accessibility, Bell, Check, ChevronRight, Circle, Eye, ImagePlus, LogOut, Trash2,
  Monitor, Palette, Settings2, Shield, UserRound, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { THEMES } from "@/lib/themes";
import { useTheme } from "@/lib/useTheme";

type Section = "perfil" | "aparencia" | "acessibilidade" | "privacidade" | "conta";
type Presence = "online" | "idle" | "dnd" | "offline";
type Preferences = { density: "comfortable" | "compact"; fontScale: "normal" | "large"; reducedMotion: boolean };

interface UserSettingsModalProps {
  userId: string;
  serverId?: string | null;
  initial: {
    displayName: string;
    username?: string | null;
    pronouns?: string | null;
    bio?: string | null;
    customStatus?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    presence?: Presence | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

const NAV: { id: Section; label: string; icon: typeof UserRound; group: string }[] = [
  { id: "perfil", label: "Meu perfil", icon: UserRound, group: "Conta" },
  { id: "privacidade", label: "Privacidade", icon: Shield, group: "Conta" },
  { id: "conta", label: "Minha conta", icon: Settings2, group: "Conta" },
  { id: "aparencia", label: "Aparência", icon: Palette, group: "Aplicativo" },
  { id: "acessibilidade", label: "Acessibilidade", icon: Accessibility, group: "Aplicativo" },
];

const DEFAULT_PREFERENCES: Preferences = { density: "comfortable", fontScale: "normal", reducedMotion: false };
const PRESENCE: { id: Presence; label: string; description: string; color: string }[] = [
  { id: "online", label: "Online", description: "Disponível para conversar", color: "bg-emerald-400" },
  { id: "idle", label: "Ausente", description: "Mostrar como ausente", color: "bg-amber-400" },
  { id: "dnd", label: "Não perturbe", description: "Mostrar que não quer interrupções", color: "bg-rose-500" },
  { id: "offline", label: "Invisível", description: "Aparecer desconectado", color: "bg-gray-500" },
];

function loadPreferences(userId: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(`sekai-preferences:${userId}`) || "null");
    return { ...DEFAULT_PREFERENCES, ...value };
  } catch { return DEFAULT_PREFERENCES; }
}

function uploadExtension(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]{1,8}$/.test(ext) ? ext : "png";
}

export function UserSettingsModal({ userId, serverId, initial, onClose, onSaved }: UserSettingsModalProps) {
  const supabase = createClient();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<Section>("perfil");
  const [profileScope, setProfileScope] = useState<"user" | "server">("user");
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username ?? "");
  const [pronouns, setPronouns] = useState(initial.pronouns ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [customStatus, setCustomStatus] = useState(initial.customStatus ?? "");
  const [presence, setPresence] = useState<Presence>(initial.presence ?? "online");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(initial.avatarUrl ?? "");
  const [bannerPreview, setBannerPreview] = useState(initial.bannerUrl ?? "");
  const [serverDisplayName, setServerDisplayName] = useState(initial.displayName);
  const [serverAvatarFile, setServerAvatarFile] = useState<File | null>(null);
  const [serverBannerFile, setServerBannerFile] = useState<File | null>(null);
  const [serverAvatarPreview, setServerAvatarPreview] = useState("");
  const [serverBannerPreview, setServerBannerPreview] = useState("");
  const [removeServerAvatar, setRemoveServerAvatar] = useState(false);
  const [removeServerBanner, setRemoveServerBanner] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [email, setEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setPreferences(loadPreferences(userId));
    void supabase.auth.getUser().then(({ data }) => { const currentEmail = data.user?.email ?? ""; setEmail(currentEmail); setEmailDraft(currentEmail); });
  }, [supabase, userId]);

  useEffect(() => {
    if (!serverId) return;
    void supabase.from("members").select("nickname,avatar_url,banner_url").eq("server_id", serverId).eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!data) return;
      setServerDisplayName(data.nickname ?? initial.displayName);
      setServerAvatarPreview(data.avatar_url ?? "");
      setServerBannerPreview(data.banner_url ?? "");
    });
  }, [initial.displayName, serverId, supabase, userId]);

  useEffect(() => {
    document.documentElement.dataset.density = preferences.density;
    document.documentElement.dataset.fontScale = preferences.fontScale;
    document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion);
    try { localStorage.setItem(`sekai-preferences:${userId}`, JSON.stringify(preferences)); } catch { /* Preferências valem até fechar a página. */ }
  }, [preferences, userId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape" && !saving) onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const currentSection = useMemo(() => NAV.find((item) => item.id === section)!, [section]);

  function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function handleImagePick(file: File | undefined, kind: "avatar" | "banner") {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Escolha um arquivo de imagem."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("A imagem deve ter no máximo 8 MB."); return; }
    setError("");
    if (profileScope === "server") {
      if (kind === "avatar") { setServerAvatarFile(file); setRemoveServerAvatar(false); setServerAvatarPreview(URL.createObjectURL(file)); }
      else { setServerBannerFile(file); setRemoveServerBanner(false); setServerBannerPreview(URL.createObjectURL(file)); }
    } else if (kind === "avatar") { setAvatarFile(file); setRemoveAvatar(false); setAvatarPreview(URL.createObjectURL(file)); }
    else { setBannerFile(file); setRemoveBanner(false); setBannerPreview(URL.createObjectURL(file)); }
  }

  async function handleSave() {
    if (section === "perfil" && profileScope === "server") {
      if (!serverId) return;
      if (!serverDisplayName.trim()) { setError("Informe um nome para este perfil de servidor."); return; }
      setSaving(true); setError(""); setNotice("");
      let avatarUrl = removeServerAvatar ? null : serverAvatarPreview || null;
      let bannerUrl = removeServerBanner ? null : serverBannerPreview || null;
      for (const item of [{ file: serverAvatarFile, kind: "avatar" as const }, { file: serverBannerFile, kind: "banner" as const }]) {
        if (!item.file) continue;
        const path = `${userId}/server-profiles/${serverId}/${item.kind}-${Date.now()}.${uploadExtension(item.file)}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, item.file, { upsert: true, contentType: item.file.type });
        if (uploadError) { setSaving(false); setError(`Falha ao enviar ${item.kind === "avatar" ? "avatar" : "banner"}: ${uploadError.message}`); return; }
        const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
        if (item.kind === "avatar") avatarUrl = url; else bannerUrl = url;
      }
      const { error: serverUpdateError } = await supabase.from("members").update({ nickname: serverDisplayName.trim(), avatar_url: avatarUrl, banner_url: bannerUrl }).eq("server_id", serverId).eq("user_id", userId);
      setSaving(false);
      if (serverUpdateError) { setError("Falha ao salvar perfil do servidor: " + serverUpdateError.message); return; }
      onSaved(); onClose(); return;
    }
    if (!displayName.trim()) { setError("Informe um nome de exibição."); setSection("perfil"); return; }
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username.trim())) { setError("O nome de usuário deve ter de 2 a 32 caracteres: letras, números, ponto, hífen ou sublinhado."); setSection("perfil"); return; }
    setSaving(true); setError(""); setNotice("");
    let avatarUrl = removeAvatar ? null : (initial.avatarUrl ?? null);
    let bannerUrl = removeBanner ? null : (initial.bannerUrl ?? null);

    for (const item of [{ file: avatarFile, kind: "avatar" as const }, { file: bannerFile, kind: "banner" as const }]) {
      if (!item.file) continue;
      const path = `${userId}/${item.kind}-${Date.now()}.${uploadExtension(item.file)}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, item.file, { upsert: true, contentType: item.file.type });
      if (uploadError) { setSaving(false); setError(`Falha ao enviar ${item.kind === "avatar" ? "avatar" : "banner"}: ${uploadError.message}`); return; }
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      if (item.kind === "avatar") avatarUrl = url; else bannerUrl = url;
    }

    const { error: updateError } = await supabase.from("profiles").update({
      display_name: displayName.trim(), username: username.trim().toLowerCase(), pronouns: pronouns.trim() || null, bio: bio.trim() || null, custom_status: customStatus.trim() || null,
      avatar_url: avatarUrl, banner_url: bannerUrl, status: presence,
    }).eq("id", userId);
    setSaving(false);
    if (updateError) { setError("Falha ao salvar: " + updateError.message); return; }
    onSaved(); onClose();
  }

  async function sendPasswordReset() {
    if (!email) return;
    setSendingReset(true); setError(""); setNotice("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setSendingReset(false);
    if (resetError) setError("Não foi possível enviar o link: " + resetError.message);
    else setNotice("Enviamos um link de redefinição para seu e-mail.");
  }

  async function changeEmail() {
    if (!emailDraft.trim() || emailDraft.trim() === email) return;
    setSendingReset(true); setError(""); setNotice("");
    const { error: emailError } = await supabase.auth.updateUser({ email: emailDraft.trim() });
    setSendingReset(false);
    if (emailError) setError("Não foi possível atualizar o e-mail: " + emailError.message);
    else setNotice("Enviamos uma confirmação para o novo endereço de e-mail.");
  }

  async function handleLogout() { await supabase.auth.signOut(); }

  return (
    <div className="settings-backdrop-enter fixed inset-0 z-[100] flex items-stretch justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="user-settings-title" className="settings-window-enter flex h-[100dvh] max-h-[100dvh] w-full min-h-0 max-w-5xl overflow-hidden bg-discord-bg-secondary shadow-2xl sm:h-[min(900px,calc(100dvh-48px))] sm:max-h-[calc(100dvh-48px)] sm:rounded-2xl">
        <aside className="hidden min-h-0 w-60 shrink-0 flex-col overflow-y-auto border-r border-black/20 bg-discord-bg-primary p-4 sm:flex">
          <div className="mb-6 flex items-center gap-3 px-2 pt-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-theme-gradient text-white"><Settings2 size={18}/></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-discord-text-muted">Sekai</p><h2 id="user-settings-title" className="font-semibold text-discord-header-primary">Configurações</h2></div>
          </div>
          {(["Conta", "Aplicativo"] as const).map((group) => <div key={group} className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-discord-text-muted">{group}</p>
            <div className="space-y-1">{NAV.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setError(""); setNotice(""); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${section === id ? "bg-discord-bg-modifier-hover text-discord-header-primary" : "text-discord-text-muted hover:bg-discord-bg-modifier-hover/60 hover:text-discord-text-normal"}`}><Icon size={17}/>{label}<ChevronRight size={14} className="ml-auto opacity-50"/></button>)}</div>
          </div>)}
          <div className="mt-auto rounded-xl bg-discord-bg-secondary p-3">
            <div className="flex items-center gap-3"><div className="h-9 w-9 overflow-hidden rounded-full bg-theme-gradient">{avatarPreview && <img src={avatarPreview} alt="" className="h-full w-full object-cover"/>}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-discord-text-normal">{displayName || "Seu perfil"}</p><p className="truncate text-xs text-discord-text-muted">Personalize seu espaço</p></div></div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-black/15 px-5 py-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-3"><select aria-label="Seção de configurações" value={section} onChange={(e) => setSection(e.target.value as Section)} className="max-w-[190px] rounded-lg bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal sm:hidden">{NAV.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><div className="hidden items-center gap-2 sm:flex"><currentSection.icon size={18} className="text-discord-brand"/><h3 className="font-semibold text-discord-header-primary">{currentSection.label}</h3></div><span className="hidden text-sm text-discord-text-muted sm:inline">/</span><span className="hidden text-sm text-discord-text-muted sm:inline">Configurações de usuário</span></div>
            <button onClick={onClose} aria-label="Fechar configurações" className="rounded-full p-2 text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-white"><X size={19}/></button>
          </header>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-6 sm:px-9 sm:py-8">
            <div className="mx-auto max-w-2xl">
              {section === "perfil" && <section className="settings-section-enter">
                {serverId && <div className="mb-6 flex gap-6 border-b border-white/10"><button type="button" aria-pressed={profileScope === "user"} onClick={() => setProfileScope("user")} className={`settings-profile-tab pb-3 text-sm font-semibold transition ${profileScope === "user" ? "text-discord-header-primary" : "text-discord-text-muted hover:text-discord-text-normal"}`}>Perfil do usuário</button><button type="button" aria-pressed={profileScope === "server"} onClick={() => setProfileScope("server")} className={`settings-profile-tab pb-3 text-sm font-semibold transition ${profileScope === "server" ? "text-discord-header-primary" : "text-discord-text-muted hover:text-discord-text-normal"}`}>Perfis do servidor</button></div>}
                <div hidden={profileScope !== "user"}>
                <div className="mb-6"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-discord-brand">Identidade</p><h1 className="mt-1 text-[25px] font-bold leading-tight tracking-tight text-discord-header-primary">Seu perfil, do seu jeito</h1><p className="mt-2 max-w-xl text-sm leading-6 text-discord-text-muted">PNG, JPG ou GIF animado · até 8 MB · visível para a comunidade Sekai.</p></div>
                <div className="settings-profile-preview mb-6 overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-primary shadow-lg shadow-black/10">
                  <div className="relative z-0 h-32 bg-theme-gradient bg-cover bg-center">
                    {bannerPreview && <img key={bannerPreview} src={bannerPreview} alt="" className="profile-card-enter pointer-events-none absolute inset-0 h-full w-full object-cover"/>}
                    <div className="absolute right-3 top-3 flex gap-2"><label className="settings-upload-control flex cursor-pointer items-center gap-2 rounded-lg bg-black/50 px-3 py-2 text-xs font-semibold text-white backdrop-blur"><ImagePlus size={15}/>Trocar banner<input type="file" accept="image/gif,image/*" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0], "banner")}/></label>{bannerPreview && <button type="button" onClick={() => { setBannerFile(null); setBannerPreview(""); setRemoveBanner(true); }} aria-label="Remover banner" className="rounded-lg bg-black/50 p-2 text-white backdrop-blur transition hover:bg-rose-500/80"><Trash2 size={15}/></button>}</div>
                  </div>
                  <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 px-5 pb-5">
                    <div className="flex min-w-0 items-end gap-3">
                      <div className="-mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-[5px] border-discord-bg-primary bg-discord-brand shadow-lg transition-transform duration-200 hover:scale-[1.04]">{avatarPreview ? <img key={avatarPreview} src={avatarPreview} alt="Prévia do avatar" className="profile-card-enter h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-2xl font-bold text-white">{displayName[0]?.toUpperCase()}</div>}</div>
                      <div className="min-w-0 pb-1.5"><p className="max-w-[190px] truncate text-[15px] font-semibold tracking-tight text-discord-header-primary">{displayName || "Seu nome"}</p><p className="mt-0.5 max-w-[190px] truncate text-[11px] text-discord-text-muted">@{username || "seu_usuario"}{pronouns ? ` · ${pronouns}` : ""}</p>{customStatus ? <p className="mt-1 max-w-[190px] truncate text-[11px] text-discord-text-muted">{customStatus}</p> : <p className="mt-1 max-w-[190px] truncate text-[11px] italic text-discord-text-muted/70">Adicione um status</p>}</div>
                    </div>
                    <div className="mb-1 flex shrink-0 gap-2"><label className="settings-upload-control cursor-pointer rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">Trocar avatar<input type="file" accept="image/gif,image/*" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0], "avatar")}/></label>{avatarPreview && <button type="button" onClick={() => { setAvatarFile(null); setAvatarPreview(""); setRemoveAvatar(true); }} aria-label="Remover avatar" className="rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-discord-text-muted transition hover:bg-rose-500/20 hover:text-rose-300"><Trash2 size={14}/></button>}</div>
                  </div>
                </div>
                <div className="grid gap-x-5 gap-y-1 md:grid-cols-2">
                  <Field label="Nome de exibição" hint={`${displayName.length}/40`}><input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" className={inputClass}/></Field>
                  <Field label="Nome de usuário" hint={`@${username.length}/32`}><input value={username} maxLength={32} onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))} placeholder="seu_usuario" className={inputClass}/></Field>
                  <Field label="Pronomes" hint={`${pronouns.length}/32`}><input value={pronouns} maxLength={32} onChange={(e) => setPronouns(e.target.value)} placeholder="ela/dela, ele/dele..." className={inputClass}/></Field>
                  <Field label="Status personalizado" hint={`${customStatus.length}/128`}><input value={customStatus} maxLength={128} onChange={(e) => setCustomStatus(e.target.value)} placeholder="O que você está fazendo?" className={inputClass}/></Field>
                </div>
                <Field label="Sobre você" hint={`${bio.length}/190 caracteres`}><textarea value={bio} maxLength={190} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Conte um pouco sobre você..." className={`${inputClass} resize-y`}/></Field>
                <div className="mt-6 rounded-xl border border-white/5 bg-discord-bg-primary p-4"><div className="mb-3 flex items-center gap-2"><Circle size={10} className="fill-current text-discord-brand"/><h4 className="text-sm font-semibold text-discord-header-primary">Presença</h4></div><div className="grid gap-2 sm:grid-cols-2">{PRESENCE.map((item) => <button type="button" key={item.id} onClick={() => setPresence(item.id)} className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${presence === item.id ? "border-discord-brand bg-discord-brand/10" : "border-white/5 hover:bg-discord-bg-modifier-hover"}`}><span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.color}`}/><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-discord-text-normal">{item.label}</span><span className="mt-0.5 block text-xs text-discord-text-muted">{item.description}</span></span>{presence === item.id && <Check size={15} className="text-discord-brand"/>}</button>)}</div><p className="mt-2 text-[11px] text-discord-text-muted">A presença é exibida no perfil e na lista de membros.</p></div>
                </div>
                {serverId && <div hidden={profileScope !== "server"}>
                  <div className="mb-6"><p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Personalização por servidor</p><h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Seu perfil neste servidor</h1><p className="mt-2 text-sm text-discord-text-muted">Use um nome, avatar ou banner diferente só aqui. GIF animado é aceito até 8 MB.</p></div>
                  <div className="settings-profile-preview mb-6 overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-primary shadow-lg shadow-black/10">
                    <div className="relative z-0 h-32 bg-theme-gradient bg-cover bg-center">
                      {serverBannerPreview && <img key={serverBannerPreview} src={serverBannerPreview} alt="" className="profile-card-enter pointer-events-none absolute inset-0 h-full w-full object-cover"/>}
                      <div className="absolute right-3 top-3 flex gap-2"><label className="settings-upload-control flex cursor-pointer items-center gap-2 rounded-lg bg-black/50 px-3 py-2 text-xs font-semibold text-white"><ImagePlus size={15}/>Trocar banner<input type="file" accept="image/gif,image/*" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0], "banner")}/></label>{serverBannerPreview && <button type="button" onClick={() => { setServerBannerFile(null); setServerBannerPreview(""); setRemoveServerBanner(true); }} aria-label="Remover banner do servidor" className="rounded-lg bg-black/50 p-2 text-white hover:bg-rose-500/80"><Trash2 size={15}/></button>}</div>
                    </div>
                    <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 px-5 pb-5">
                      <div className="flex min-w-0 items-end gap-3">
                        <div className="-mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-[5px] border-discord-bg-primary bg-discord-brand shadow-lg transition-transform duration-200 hover:scale-[1.04]">{serverAvatarPreview ? <img key={serverAvatarPreview} src={serverAvatarPreview} alt="Avatar do servidor" className="profile-card-enter h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-2xl font-bold text-white">{serverDisplayName[0]?.toUpperCase()}</div>}</div>
                        <div className="min-w-0 pb-1.5"><p className="max-w-[190px] truncate text-[15px] font-semibold tracking-tight text-discord-header-primary">{serverDisplayName || "Seu nome"}</p><p className="mt-0.5 max-w-[190px] truncate text-[11px] text-discord-text-muted">Seu nome neste servidor</p></div>
                      </div>
                      <div className="mb-1 flex shrink-0 gap-2"><label className="settings-upload-control cursor-pointer rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">Trocar avatar<input type="file" accept="image/gif,image/*" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0], "avatar")}/></label>{serverAvatarPreview && <button type="button" onClick={() => { setServerAvatarFile(null); setServerAvatarPreview(""); setRemoveServerAvatar(true); }} aria-label="Remover avatar do servidor" className="rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-discord-text-muted hover:text-rose-300"><Trash2 size={14}/></button>}</div>
                    </div>
                  </div>
                  <Field label="Nome neste servidor" hint={`${serverDisplayName.length}/32`}><input value={serverDisplayName} maxLength={32} onChange={(e) => setServerDisplayName(e.target.value)} placeholder="Nome de exibição" className={inputClass}/></Field>
                </div>}
              </section>}

              {section === "aparencia" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Seu espaço" title="Aparência" text="Escolha cores e uma densidade de interface que combine com você."/>
                <div className="mb-7"><h4 className="mb-3 text-sm font-semibold text-discord-header-primary">Tema de cores <span className="ml-1 font-normal text-discord-text-muted">{THEMES.find((item) => item.id === theme)?.name}</span></h4><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{THEMES.map((option) => <button key={option.id} type="button" onClick={() => setTheme(option.id)} className={`overflow-hidden rounded-xl border text-left transition ${theme === option.id ? "border-discord-brand ring-2 ring-discord-brand/30" : "border-white/10 hover:border-white/30"}`}><span className="relative block h-16" style={{ background: `linear-gradient(135deg, ${option.stops.join(", ")})` }}>{theme === option.id && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/40"><Check size={14} className="text-white"/></span>}<span className="absolute inset-x-2 bottom-2 flex gap-1">{option.stops.slice(1, 5).map((color) => <i key={color} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: color }}/>)}</span></span><span className="block bg-discord-bg-primary px-3 py-2 text-xs font-semibold text-discord-text-normal">{option.name}</span></button>)}</div><p className="mt-2 text-xs text-discord-text-muted">O tema é salvo neste navegador e aplicado em todas as áreas do Sekai.</p></div>
                <PreferenceCard icon={Monitor} title="Densidade da interface" description="Escolha quanto espaço os elementos ocupam."><div className="grid grid-cols-2 gap-2">{([['comfortable', 'Confortável'], ['compact', 'Compacta']] as const).map(([value, label]) => <Choice key={value} active={preferences.density === value} onClick={() => setPreference("density", value)}>{label}</Choice>)}</div></PreferenceCard>
              </section>}

              {section === "acessibilidade" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Conforto" title="Acessibilidade" text="Ajuste leitura e movimento para tornar o Sekai mais confortável."/>
                <PreferenceCard icon={Accessibility} title="Tamanho do texto" description="Aumente o texto da interface sem alterar o conteúdo das mensagens."><div className="grid grid-cols-2 gap-2">{([['normal', 'Padrão'], ['large', 'Maior']] as const).map(([value, label]) => <Choice key={value} active={preferences.fontScale === value} onClick={() => setPreference("fontScale", value)}>{label}</Choice>)}</div></PreferenceCard>
                <ToggleRow title="Reduzir animações" description="Desativa transições e animações decorativas." checked={preferences.reducedMotion} onChange={(value) => setPreference("reducedMotion", value)}/>
                <div className="mt-5 flex items-start gap-3 rounded-xl bg-discord-bg-primary p-4 text-xs leading-5 text-discord-text-muted"><Eye size={17} className="mt-0.5 shrink-0 text-discord-brand"/>Essas preferências ficam salvas neste navegador e são aplicadas imediatamente.</div>
              </section>}

              {section === "privacidade" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Visibilidade" title="Privacidade" text="Controle o que as outras pessoas conseguem ver sobre sua atividade."/>
                <div className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary p-4"><div className="mb-4 flex items-start gap-3"><Shield size={18} className="mt-0.5 text-discord-brand"/><div><h4 className="text-sm font-semibold text-discord-header-primary">Quem vê sua presença</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">Escolha como seu estado aparece para amigos e membros dos servidores.</p></div></div><div className="space-y-2">{PRESENCE.map((item) => <button key={item.id} onClick={() => setPresence(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${presence === item.id ? "bg-discord-brand/10" : "hover:bg-discord-bg-modifier-hover"}`}><span className={`h-2.5 w-2.5 rounded-full ${item.color}`}/><span className="flex-1 text-sm text-discord-text-normal">{item.label}</span>{presence === item.id && <Check size={16} className="text-discord-brand"/>}</button>)}</div><p className="mt-3 text-[11px] text-discord-text-muted">A alteração será salva junto com seu perfil.</p></div>
                <div className="flex items-start gap-3 rounded-xl border border-white/5 p-4"><Eye size={17} className="mt-0.5 text-discord-text-muted"/><div><h4 className="text-sm font-semibold text-discord-header-primary">Perfil público</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">Nome, avatar, banner, status e bio ficam visíveis para usuários autenticados do Sekai.</p></div></div>
              </section>}

              {section === "conta" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Acesso" title="Minha conta" text="Revise seus dados de acesso e proteja sua conta."/>
                <div className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary p-5"><div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-discord-brand/15 text-discord-brand"><Bell size={19}/></div><div><h4 className="font-semibold text-discord-header-primary">E-mail da conta</h4><p className="text-xs text-discord-text-muted">O novo e-mail precisa ser confirmado.</p></div></div><div className="flex flex-wrap gap-2"><input type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="voce@exemplo.com" className={`${inputClass} mt-0 min-w-[180px] flex-1`}/><button onClick={() => void changeEmail()} disabled={!emailDraft.trim() || emailDraft.trim() === email || sendingReset} className="rounded-lg bg-discord-bg-modifier-hover px-4 py-2.5 text-sm font-semibold text-discord-text-normal transition hover:brightness-125 disabled:opacity-50">Atualizar e-mail</button></div><p className="mt-2 text-xs text-discord-text-muted">Atual: {email || "indisponível"}</p></div>
                <div className="mb-7 rounded-xl border border-white/5 p-5"><h4 className="font-semibold text-discord-header-primary">Senha</h4><p className="mt-1 text-sm text-discord-text-muted">Enviaremos um link seguro para redefinir sua senha.</p><button disabled={!email || sendingReset} onClick={() => void sendPasswordReset()} className="mt-4 rounded-lg bg-discord-bg-modifier-hover px-4 py-2.5 text-sm font-semibold text-discord-text-normal transition hover:brightness-125 disabled:opacity-50">{sendingReset ? "Enviando..." : "Enviar link de redefinição"}</button></div>
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5"><h4 className="font-semibold text-rose-300">Sessão</h4><p className="mt-1 text-sm text-discord-text-muted">Encerre sua sessão neste dispositivo.</p><button onClick={() => void handleLogout()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-4 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"><LogOut size={16}/>Sair da conta</button></div>
              </section>}
            </div>
          </div>

          {(error || notice) && <div className={`mx-5 mb-3 rounded-lg px-3 py-2 text-sm sm:mx-9 ${error ? "bg-discord-danger/10 text-discord-danger" : "bg-emerald-500/10 text-emerald-300"}`} role={error ? "alert" : "status"}>{error || notice}</div>}
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-black/15 bg-discord-bg-secondary px-5 py-4 sm:px-9"><p className="hidden text-xs text-discord-text-muted sm:block">As preferências de aparência são aplicadas na hora.</p><div className="ml-auto flex gap-2"><button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-white">Fechar</button><button onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-theme-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{saving ? "Salvando..." : section === "perfil" && profileScope === "server" ? "Salvar perfil do servidor" : "Salvar perfil"}</button></div></footer>
        </main>
      </div>
    </div>
  );
}

const inputClass = "mt-2 w-full rounded-lg border border-white/5 bg-discord-bg-primary px-3.5 py-3 text-sm text-discord-text-normal outline-none transition placeholder:text-discord-text-muted/60 focus:border-discord-brand/70 focus:ring-2 focus:ring-discord-brand/15";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="mb-4 block min-w-0"><span className="mb-1.5 flex min-h-4 items-center justify-between gap-2 text-[11px] font-semibold uppercase leading-none tracking-[.055em] text-discord-text-muted"><span className="min-w-0 truncate">{label}</span>{hint && <span className="shrink-0 whitespace-nowrap text-[10px] font-normal normal-case tracking-normal tabular-nums">{hint}</span>}</span>{children}</label>;
}

function SectionIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="mb-7"><p className="text-xs font-bold uppercase tracking-widest text-discord-brand">{eyebrow}</p><h1 className="mt-1 text-2xl font-bold text-discord-header-primary">{title}</h1><p className="mt-2 text-sm text-discord-text-muted">{text}</p></div>;
}

function PreferenceCard({ icon: Icon, title, description, children }: { icon: typeof Monitor; title: string; description: string; children: React.ReactNode }) {
  return <div className="mb-4 rounded-xl border border-white/5 bg-discord-bg-primary p-4"><div className="mb-4 flex items-start gap-3"><Icon size={18} className="mt-0.5 text-discord-brand"/><div><h4 className="text-sm font-semibold text-discord-header-primary">{title}</h4><p className="mt-1 text-xs text-discord-text-muted">{description}</p></div></div>{children}</div>;
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-2.5 text-sm transition ${active ? "border-discord-brand bg-discord-brand/10 text-discord-text-normal" : "border-white/10 text-discord-text-muted hover:bg-discord-bg-modifier-hover"}`}>{children}</button>;
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 border-b border-white/5 py-5"><div><h4 className="text-sm font-semibold text-discord-header-primary">{title}</h4><p className="mt-1 text-xs text-discord-text-muted">{description}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={title} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-discord-brand" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`}/></button></div>;
}
