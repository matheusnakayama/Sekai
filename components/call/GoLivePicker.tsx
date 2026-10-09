'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenFrameRate, ScreenResolution, ScreenShareSettings } from '@/components/Controls';

export type GoLiveSurface = 'window' | 'monitor' | 'browser';

export interface GoLiveSelection {
  surface: GoLiveSurface;
  shareAudio: boolean;
}

const RESOLUTIONS: ScreenResolution[] = [480, 720, 1080, 1440, 2160];
const FRAME_RATES: ScreenFrameRate[] = [30, 60, 90, 120];

interface ScreenChoice {
  id: string;
  label: string;
  detail: string;
  primary: boolean;
}

interface ScreenDetailsResult {
  screens: Array<{ label: string; width: number; height: number; isPrimary: boolean }>;
}

const APPLICATION_CHOICES: Array<{ id: string; surface: GoLiveSurface; label: string; detail: string }> = [
  { id: 'window', surface: 'window', label: 'Janela de um programa', detail: 'Jogo, navegador ou outro aplicativo' },
  { id: 'browser', surface: 'browser', label: 'Guia do navegador', detail: 'Uma aba aberta' },
];

export default function GoLivePicker({
  settings,
  busy = false,
  initialTab = 'applications',
  onSettingsChange,
  onCancel,
  onConfirm,
}: {
  settings: ScreenShareSettings;
  busy?: boolean;
  initialTab?: 'applications' | 'screens';
  onSettingsChange: (settings: ScreenShareSettings) => void;
  onCancel: () => void;
  onConfirm: (selection: GoLiveSelection) => void;
}) {
  const [tab, setTab] = useState<'applications' | 'screens'>(initialTab);
  const [selectedId, setSelectedId] = useState('window');
  const [shareAudio, setShareAudio] = useState(false);
  const [screens, setScreens] = useState<ScreenChoice[] | null>(null);
  const [loadingScreens, setLoadingScreens] = useState(false);

  useEffect(() => {
    if (initialTab === 'screens') void openScreens();
    // A aba inicial só vale na abertura do seletor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  async function openScreens() {
    setTab('screens');
    if (screens || loadingScreens) return;
    const getter = (window as Window & { getScreenDetails?: () => Promise<ScreenDetailsResult> }).getScreenDetails;
    if (!getter) {
      setScreens([]);
      setSelectedId('monitor');
      return;
    }
    setLoadingScreens(true);
    try {
      const details = await getter();
      const choices = details.screens.map((screen, index) => ({
        id: `monitor-${index}`,
        label: screen.label || `Tela ${index + 1}`,
        detail: `${screen.width} × ${screen.height}`,
        primary: screen.isPrimary,
      }));
      setScreens(choices);
      setSelectedId(choices.find((choice) => choice.primary)?.id ?? choices[0]?.id ?? 'monitor');
    } catch {
      setScreens([]);
      setSelectedId('monitor');
    } finally {
      setLoadingScreens(false);
    }
  }

  function confirm() {
    if (busy) return;
    if (tab === 'applications') {
      const choice = APPLICATION_CHOICES.find((item) => item.id === selectedId) ?? APPLICATION_CHOICES[0];
      onConfirm({ surface: choice.surface, shareAudio });
      return;
    }
    onConfirm({ surface: 'monitor', shareAudio });
  }

  const screenChoices: ScreenChoice[] = screens?.length
    ? screens
    : [{ id: 'monitor', label: 'Tela inteira', detail: 'O monitor que você confirmar', primary: true }];

  const dialog = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" onMouseDown={() => { if (!busy) onCancel(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="golive-title"
        className="w-full max-w-[460px] overflow-hidden rounded-lg bg-discord-bg-dark text-discord-text-normal shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative h-[128px] bg-discord-bg-darkest">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fechar"
            className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full text-discord-text-muted transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <span aria-hidden="true" className="text-lg leading-none">×</span>
          </button>
          <GoLiveArt />
        </div>

        <div className="px-5 pb-1 pt-4 text-center">
          <h2 id="golive-title" className="text-[20px] font-bold leading-6 text-discord-header-primary">Apresentar tela</h2>
          <p className="mx-auto mt-1 max-w-[320px] text-[13px] leading-5 text-discord-text-muted">
            Escolha algo para transmitir e chame a galera para assistir.
          </p>
        </div>

        <div className="mt-3 flex gap-5 border-b border-black/30 px-5" role="tablist">
          <TabButton active={tab === 'applications'} onClick={() => { setTab('applications'); setSelectedId('window'); }}>
            Aplicativos
          </TabButton>
          <TabButton active={tab === 'screens'} onClick={() => { void openScreens(); }}>
            Telas
          </TabButton>
        </div>

        <div className="grid min-h-[236px] grid-cols-2 gap-3 px-4 py-4" role="listbox" aria-label={tab === 'applications' ? 'Aplicativos' : 'Telas'}>
          {tab === 'applications' ? APPLICATION_CHOICES.map((choice) => (
            <SourceCard
              key={choice.id}
              label={choice.label}
              detail={choice.detail}
              selected={selectedId === choice.id}
              onSelect={() => setSelectedId(choice.id)}
            >
              {choice.surface === 'window' ? <WindowPreview /> : <TabPreview />}
            </SourceCard>
          )) : loadingScreens ? (
            <p className="col-span-2 self-center text-center text-xs text-discord-text-muted">Procurando monitores…</p>
          ) : screenChoices.map((choice) => (
            <SourceCard
              key={choice.id}
              label={choice.label}
              detail={choice.primary ? `${choice.detail} · principal` : choice.detail}
              selected={selectedId === choice.id}
              onSelect={() => setSelectedId(choice.id)}
            >
              <MonitorPreview />
            </SourceCard>
          ))}
        </div>

        <p className="px-5 pb-3 text-[11px] leading-4 text-discord-text-muted">
          {tab === 'applications'
            ? 'Ao vivo abre a confirmação do navegador já na lista de janelas ou de guias.'
            : 'Ao vivo abre a confirmação do navegador já na tela inteira.'}
        </p>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/25 px-4 py-3">
          <label className="mr-auto flex items-center gap-2 text-[12px] text-discord-text-muted">
            <span>Qualidade</span>
            <select
              aria-label="Resolução da apresentação"
              value={settings.height}
              disabled={busy}
              onChange={(event) => onSettingsChange({ ...settings, height: Number(event.target.value) as ScreenResolution })}
              className="rounded bg-discord-bg-darkest px-2 py-1 text-xs text-white outline-none"
            >
              {RESOLUTIONS.map((height) => (
                <option key={height} value={height}>{height === 2160 ? '4K' : `${height}p`}</option>
              ))}
            </select>
            <select
              aria-label="Quadros por segundo da apresentação"
              value={settings.frameRate}
              disabled={busy}
              onChange={(event) => onSettingsChange({ ...settings, frameRate: Number(event.target.value) as ScreenFrameRate })}
              className="rounded bg-discord-bg-darkest px-2 py-1 text-xs text-white outline-none"
            >
              {FRAME_RATES.map((frameRate) => (
                <option key={frameRate} value={frameRate}>{frameRate} fps</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pb-4">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-discord-text-normal">
            <input
              type="checkbox"
              checked={shareAudio}
              disabled={busy}
              onChange={(event) => setShareAudio(event.target.checked)}
              className="h-4 w-4 accent-discord-brand"
            />
            Compartilhar áudio
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded px-3 py-2 text-sm font-medium text-white transition hover:underline disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy || !selectedId}
              className="rounded bg-discord-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-discord-brand-hover disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? 'Abrindo…' : 'Ao vivo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2 text-sm font-semibold transition ${active ? 'border-white text-white' : 'border-transparent text-discord-text-muted hover:border-white/30 hover:text-discord-text-normal'}`}
    >
      {children}
    </button>
  );
}

function SourceCard({
  label,
  detail,
  selected,
  onSelect,
  children,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`overflow-hidden rounded-md border-2 bg-black/30 text-left transition ${selected ? 'border-discord-brand' : 'border-transparent hover:border-white/25'}`}
    >
      <div className="relative h-[104px] bg-[#111214]">{children}</div>
      <span className="block truncate px-2 pb-2 pt-1.5 text-[12px] font-medium text-discord-header-primary">{label}</span>
      <span className="block truncate px-2 pb-2 text-[10px] text-discord-text-muted">{detail}</span>
    </button>
  );
}

function WindowPreview() {
  return (
    <svg viewBox="0 0 160 104" className="h-full w-full" aria-hidden="true">
      <rect x="18" y="16" width="124" height="74" rx="6" fill="#2b2d31" />
      <rect x="18" y="16" width="124" height="16" rx="6" fill="#1e1f22" />
      <rect x="18" y="26" width="124" height="6" fill="#1e1f22" />
      <circle cx="28" cy="24" r="2.2" fill="#f23f43" />
      <circle cx="36" cy="24" r="2.2" fill="#f0b232" />
      <circle cx="44" cy="24" r="2.2" fill="#23a55a" />
      <rect x="28" y="42" width="72" height="6" rx="2" fill="#5865f2" opacity="0.85" />
      <rect x="28" y="54" width="104" height="4" rx="2" fill="#ffffff" opacity="0.16" />
      <rect x="28" y="62" width="88" height="4" rx="2" fill="#ffffff" opacity="0.1" />
    </svg>
  );
}

function TabPreview() {
  return (
    <svg viewBox="0 0 160 104" className="h-full w-full" aria-hidden="true">
      <rect x="16" y="22" width="128" height="66" rx="6" fill="#2b2d31" />
      <rect x="22" y="14" width="46" height="16" rx="4" fill="#3f4147" />
      <rect x="72" y="16" width="40" height="12" rx="4" fill="#1e1f22" />
      <rect x="26" y="40" width="108" height="36" rx="3" fill="#111214" />
      <rect x="34" y="48" width="40" height="4" rx="2" fill="#ffffff" opacity="0.2" />
      <rect x="34" y="58" width="70" height="4" rx="2" fill="#5865f2" opacity="0.7" />
    </svg>
  );
}

function MonitorPreview() {
  return (
    <svg viewBox="0 0 160 104" className="h-full w-full" aria-hidden="true">
      <rect x="28" y="14" width="104" height="64" rx="6" fill="#2b2d31" />
      <rect x="34" y="20" width="92" height="52" rx="2" fill="#111214" />
      <rect x="42" y="32" width="36" height="28" rx="2" fill="#5865f2" opacity="0.55" />
      <rect x="82" y="32" width="36" height="12" rx="2" fill="#ffffff" opacity="0.12" />
      <rect x="82" y="48" width="28" height="12" rx="2" fill="#ffffff" opacity="0.08" />
      <path d="M68 78h24l6 10H62l6-10Z" fill="#3f4147" />
      <rect x="58" y="88" width="44" height="4" rx="2" fill="#3f4147" />
    </svg>
  );
}

function GoLiveArt() {
  return (
    <svg viewBox="0 0 460 128" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <rect width="460" height="128" fill="#1e1f22" />
      <circle cx="58" cy="26" r="3" fill="#ffffff" opacity="0.7" />
      <circle cx="400" cy="22" r="2.2" fill="#ffffff" opacity="0.45" />
      <circle cx="424" cy="46" r="2.4" fill="#c9cdfb" />
      <path d="M36 118c60-34 120-30 180-6 50 20 100 8 180-22v38H36V118Z" fill="#111214" />
      <rect x="150" y="18" width="160" height="70" rx="8" fill="#4e5058" />
      <rect x="160" y="28" width="140" height="50" rx="4" fill="#5865f2" />
      <rect x="172" y="38" width="70" height="7" rx="2" fill="#ffffff" />
      <rect x="172" y="50" width="108" height="4" rx="2" fill="#ffffff" opacity="0.55" />
      <rect x="172" y="58" width="84" height="4" rx="2" fill="#ffffff" opacity="0.35" />
      <circle cx="196" cy="96" r="13" fill="#f2f3f5" />
      <rect x="182" y="106" width="28" height="14" rx="6" fill="#c7ccd1" />
      <circle cx="258" cy="98" r="12" fill="#ffffff" />
      <rect x="246" y="107" width="24" height="14" rx="6" fill="#a3a9b3" />
    </svg>
  );
}
