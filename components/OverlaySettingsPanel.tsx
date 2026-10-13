"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Gamepad2, Mic, Monitor, Move, Users } from "lucide-react";

const DEFAULT_SETTINGS: SekaiOverlaySettings = {
  enabled: false,
  opacity: 82,
  scale: 100,
  position: "top-left",
  toggleShortcut: "Control+Shift+F10",
  showAvatars: true,
  showNames: true,
  maxParticipants: 8,
};

const POSITIONS: { id: SekaiOverlaySettings["position"]; label: string }[] = [
  { id: "top-left", label: "Superior esquerdo" },
  { id: "top-right", label: "Superior direito" },
  { id: "bottom-left", label: "Inferior esquerdo" },
  { id: "bottom-right", label: "Inferior direito" },
];

const SHORTCUTS: { id: SekaiOverlaySettings["toggleShortcut"]; label: string }[] = [
  { id: "Control+Shift+F10", label: "Ctrl + Shift + F10" },
  { id: "Control+Shift+F9", label: "Ctrl + Shift + F9" },
  { id: "Alt+Shift+F10", label: "Alt + Shift + F10" },
  { id: "Alt+Shift+F9", label: "Alt + Shift + F9" },
];

export function OverlaySettingsPanel() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const desktop = typeof window !== "undefined" ? window.sekaiDesktop : undefined;

  useEffect(() => {
    let active = true;
    const api = window.sekaiDesktop;
    if (typeof api?.getOverlaySettings !== "function") {
      setLoaded(true);
      return;
    }
    void api.getOverlaySettings().then((saved) => {
      if (active) {
        setSettings({ ...DEFAULT_SETTINGS, ...saved });
        setLoaded(true);
      }
    }).catch(() => setLoaded(true));
    return () => { active = false; };
  }, []);

  const update = useCallback((patch: Partial<SekaiOverlaySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (typeof desktop?.updateOverlaySettings === "function") void desktop.updateOverlaySettings(next);
  }, [desktop, settings]);

  if (!desktop) return null;

  if (typeof desktop.getOverlaySettings !== "function" || typeof desktop.updateOverlaySettings !== "function") {
    return (
      <section className="settings-section-enter">
        <div className="mb-7">
          <p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Somente no aplicativo</p>
          <h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Sobreposição de jogo</h1>
        </div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-4 text-sm leading-6 text-discord-text-normal" role="status">
          Este aplicativo ainda não tem suporte à sobreposição. Atualize ou reinstale o Sekai para usar esse recurso.
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section-enter">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Somente no aplicativo</p>
        <h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Sobreposição de jogo</h1>
        <p className="mt-2 text-sm leading-6 text-discord-text-muted">Veja quem está na chamada e quem está falando por cima do jogo ou de outros programas.</p>
      </div>

      <div className="mb-5 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-discord-brand/15 text-discord-brand"><Gamepad2 size={19}/></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-discord-header-primary">Ativar sobreposição</h3>
            <p className="mt-1 text-xs leading-5 text-discord-text-muted">A janela aparece automaticamente durante uma chamada e fica acima dos outros programas.</p>
          </div>
          <Switch checked={settings.enabled} label="Ativar sobreposição" disabled={!loaded} onChange={(enabled) => update({ enabled })}/>
        </div>
      </div>

      <SettingsBlock icon={Move} title="Posição na tela" description="Escolha um canto do monitor onde o Sekai está aberto.">
        <div className="grid grid-cols-2 gap-2">
          {POSITIONS.map((position) => <button key={position.id} type="button" aria-pressed={settings.position === position.id} onClick={() => update({ position: position.id })} className={`rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition ${settings.position === position.id ? "border-discord-brand bg-discord-brand/10 text-discord-text-normal" : "border-white/10 text-discord-text-muted hover:bg-discord-bg-modifier-hover"}`}>{position.label}</button>)}
        </div>
      </SettingsBlock>

      <SettingsBlock icon={Eye} title="Opacidade" description="Deixe o widget mais discreto enquanto joga.">
        <RangeSetting label={`${settings.opacity}%`} min={25} max={100} value={settings.opacity} onChange={(opacity) => update({ opacity })}/>
      </SettingsBlock>

      <SettingsBlock icon={Monitor} title="Tamanho" description="Ajuste o tamanho dos nomes e avatares.">
        <RangeSetting label={`${settings.scale}%`} min={75} max={140} value={settings.scale} onChange={(scale) => update({ scale })}/>
      </SettingsBlock>

      <SettingsBlock icon={Users} title="Participantes" description="Limite quantas pessoas aparecem antes do contador de participantes restantes.">
        <select aria-label="Máximo de participantes na sobreposição" value={settings.maxParticipants} onChange={(event) => update({ maxParticipants: Number(event.target.value) })} className="rounded-lg border border-white/10 bg-discord-bg-secondary px-3 py-2 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70">
          {[2, 4, 6, 8, 10, 12].map((count) => <option key={count} value={count}>{count} pessoas</option>)}
        </select>
      </SettingsBlock>

      <SettingsBlock icon={Move} title="Atalho para abrir ou fechar" description="Escolha uma combinação global para mostrar ou ocultar o widget.">
        <select aria-label="Atalho da sobreposição" value={settings.toggleShortcut} onChange={(event) => update({ toggleShortcut: event.target.value as SekaiOverlaySettings["toggleShortcut"] })} className="w-full rounded-lg border border-white/10 bg-discord-bg-secondary px-3 py-2 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70">
          {SHORTCUTS.map((shortcut) => <option key={shortcut.id} value={shortcut.id}>{shortcut.label}</option>)}
        </select>
      </SettingsBlock>

      <div className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary px-4">
        <ToggleLine icon={Eye} title="Mostrar avatares" checked={settings.showAvatars} onChange={(showAvatars) => update({ showAvatars })}/>
        <ToggleLine icon={Users} title="Mostrar nomes" checked={settings.showNames} onChange={(showNames) => update({ showNames })}/>
      </div>

      <div className="mb-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[.04] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-discord-header-primary"><Mic size={16} className="text-emerald-400"/>Atalhos do aplicativo</div>
        <p className="text-xs leading-5 text-discord-text-muted"><kbd className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-discord-text-normal">{SHORTCUTS.find((shortcut) => shortcut.id === settings.toggleShortcut)?.label || "Ctrl + Shift + F10"}</kbd> mostra ou oculta a sobreposição. <kbd className="ml-1 rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-discord-text-normal">Ctrl + Shift + F11</kbd> ativa ou desativa os cliques no widget; clique em um participante para voltar à chamada.</p>
      </div>

      <div className="rounded-xl border border-white/5 p-4 text-xs leading-5 text-discord-text-muted">
        A sobreposição pode funcionar em jogos em janela ou sem bordas. Alguns jogos em tela cheia exclusiva e sistemas antitrapaça podem ocultar ou bloquear janelas de outros aplicativos.
      </div>
    </section>
  );
}

function SettingsBlock({ icon: Icon, title, description, children }: { icon: typeof Monitor; title: string; description: string; children: React.ReactNode }) {
  return <div className="mb-4 rounded-xl border border-white/5 bg-discord-bg-primary p-4"><div className="mb-4 flex items-start gap-3"><Icon size={17} className="mt-0.5 text-discord-brand"/><div><h4 className="text-sm font-semibold text-discord-header-primary">{title}</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">{description}</p></div></div>{children}</div>;
}

function RangeSetting({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return <label className="flex items-center gap-3"><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-2 min-w-0 flex-1 cursor-pointer accent-discord-brand"/><span className="w-12 text-right text-xs tabular-nums text-discord-text-muted">{label}</span></label>;
}

function Switch({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-discord-brand" : "bg-white/15"} disabled:cursor-wait disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`}/></button>;
}

function ToggleLine({ icon: Icon, title, checked, onChange }: { icon: typeof Monitor; title: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center gap-3 border-b border-white/5 py-3 last:border-b-0"><Icon size={16} className="text-discord-text-muted"/><span className="flex-1 text-sm text-discord-text-normal">{title}</span><Switch checked={checked} label={title} onChange={onChange}/></div>;
}
