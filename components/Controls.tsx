'use client';

import { useState } from 'react';
import { Music2, Play, Volume2, VolumeX } from 'lucide-react';
import { CamIcon, ChatIcon, CheckIcon, HangupIcon, LinkIcon, MicIcon, PeopleIcon, ScreenShareIcon } from './icons';

export interface SoundboardEffect {
  id: string;
  name: string;
  assetUrl: string;
}

export type ScreenResolution = 480 | 720 | 1080 | 1440 | 2160;
export type ScreenFrameRate = 30 | 60 | 90 | 120;
export interface ScreenShareSettings {
  height: ScreenResolution;
  frameRate: ScreenFrameRate;
}

const RESOLUTIONS: ScreenResolution[] = [480, 720, 1080, 1440, 2160];
const FRAME_RATES: ScreenFrameRate[] = [30, 60, 90, 120];

export default function Controls({
  micOn,
  deafened,
  camOn,
  sharingScreen,
  screenAudioAvailable,
  screenAudioEnabled,
  screenShareSettings,
  onScreenShareSettingsChange,
  participantCount,
  chatUnreadCount,
  isHost,
  micLockedByHost,
  soundEffects,
  soundEffectsLoading,
  playingSoundId,
  onToggleMic,
  onToggleDeafen,
  onToggleCam,
  onToggleScreenShare,
  onToggleScreenAudio,
  onLeave,
  onCopyLink,
  onToggleParticipants,
  onToggleChat,
  onPlaySoundEffect,
}: {
  micOn: boolean;
  deafened: boolean;
  camOn: boolean;
  sharingScreen: boolean;
  screenAudioAvailable: boolean;
  screenAudioEnabled: boolean;
  screenShareSettings: ScreenShareSettings;
  onScreenShareSettingsChange: (settings: ScreenShareSettings) => void;
  participantCount: number;
  chatUnreadCount: number;
  isHost: boolean;
  micLockedByHost: boolean;
  soundEffects: SoundboardEffect[];
  soundEffectsLoading: boolean;
  playingSoundId: string | null;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleScreenAudio: () => void;
  onLeave: () => void;
  onCopyLink: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onPlaySoundEffect: (effect: SoundboardEffect) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);

  function handleCopy() {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap px-3">
      <ControlButton
        active={micOn}
        activeLabel="Silenciar microfone"
        inactiveLabel="Ativar microfone"
        onClick={onToggleMic}
        danger={!micOn}
        disabled={micLockedByHost}
        title={micLockedByHost ? 'O anfitrião bloqueou seu microfone' : undefined}
      >
        <MicIcon off={!micOn} />
      </ControlButton>

      <ControlButton
        active={!deafened}
        activeLabel="Ensurdecer"
        inactiveLabel="Reativar áudio"
        onClick={onToggleDeafen}
        danger={deafened}
      >
        {deafened ? <VolumeX className="h-5 w-5"/> : <Volume2 className="h-5 w-5"/>}
      </ControlButton>

      <ControlButton
        active={camOn}
        activeLabel="Desligar câmera"
        inactiveLabel="Ligar câmera"
        onClick={onToggleCam}
        danger={!camOn}
      >
        <CamIcon off={!camOn} />
      </ControlButton>

      <ControlButton
        active={!sharingScreen}
        activeLabel="Compartilhar tela"
        inactiveLabel="Parar compartilhamento"
        onClick={onToggleScreenShare}
        highlight={sharingScreen}
      >
        <ScreenShareIcon active={sharingScreen} />
      </ControlButton>

      <div className="relative">
        <button
          type="button"
          onClick={() => setSoundboardOpen((open) => !open)}
          aria-label="Abrir efeitos sonoros do servidor"
          aria-expanded={soundboardOpen}
          title="Efeitos sonoros"
          className={`h-12 w-12 rounded-full border flex items-center justify-center transition-colors ${soundboardOpen ? 'border-brand-400/50 bg-brand-500/20 text-white' : 'border-surface-border bg-surface-card text-white/80 hover:bg-surface-border'}`}
        >
          <Music2 className="h-5 w-5" />
        </button>
        {soundboardOpen && (
          <div className="absolute bottom-full right-0 z-50 mb-3 w-80 max-w-[calc(100vw_-_2rem)] overflow-hidden rounded-2xl border border-surface-border bg-[#17191f] p-3 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">Efeitos sonoros</h3>
                <p className="mt-0.5 text-[11px] text-white/50">Os sons são transmitidos para esta chamada.</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/50">{soundEffects.length}</span>
            </div>
            {soundEffectsLoading ? (
              <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-5 text-center text-xs text-white/55">Carregando os efeitos do servidor…</div>
            ) : soundEffects.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-5 text-center">
                <Music2 className="mx-auto h-5 w-5 text-white/30" />
                <p className="mt-2 text-xs font-medium text-white/70">Nenhum efeito neste servidor</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/45">Um administrador pode adicionar sons em Configurações do servidor → Painel de efeitos sonoros.</p>
              </div>
            ) : (
              <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {soundEffects.map((effect) => (
                  <button
                    key={effect.id}
                    type="button"
                    disabled={playingSoundId !== null}
                    onClick={() => onPlaySoundEffect(effect)}
                    title={`Reproduzir ${effect.name} para a chamada`}
                    className="group flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-2.5 py-2.5 text-left transition hover:border-brand-400/35 hover:bg-brand-500/10 disabled:cursor-wait disabled:opacity-55"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-white/70 group-hover:text-white">
                      {playingSoundId === effect.id ? <span className="h-3 w-3 animate-pulse rounded-full bg-brand-400" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                    </span>
                    <span className="truncate text-xs font-medium">{effect.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {sharingScreen && (
        <button
          type="button"
          onClick={onToggleScreenAudio}
          disabled={!screenAudioAvailable || micLockedByHost}
          aria-pressed={screenAudioEnabled}
          aria-label={screenAudioEnabled ? 'Silenciar áudio compartilhado da tela' : 'Transmitir áudio compartilhado da tela'}
          title={!screenAudioAvailable
            ? 'Para compartilhar áudio, marque “Compartilhar áudio” no seletor do navegador ao iniciar a apresentação.'
            : micLockedByHost
              ? 'O anfitrião bloqueou o envio de áudio.'
              : screenAudioEnabled
                ? 'Silenciar o áudio da tela. Seu microfone continua ativo.'
                : 'Transmitir áudio da tela. Ele pode incluir sons e vozes de outros aplicativos.'}
          className={`rounded-2xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
            screenAudioEnabled
              ? 'border-brand-400/50 bg-brand-500/20 text-white'
              : 'border-surface-border bg-surface-card text-white/75 hover:bg-surface-border'
          }`}
        >
          {!screenAudioAvailable ? 'Áudio indisponível' : screenAudioEnabled ? 'Áudio da tela: ligado' : 'Áudio da tela: desligado'}
        </button>
      )}

      <div className="flex items-center gap-2">
        <label className="w-36 rounded-2xl border border-surface-border bg-surface-card px-3 py-2 text-xs text-white/75 sm:w-44">
          <span className="flex items-center justify-between gap-2">
            <span>Resolução</span>
            <output className="font-semibold text-white">
              {screenShareSettings.height === 2160 ? '4K' : `${screenShareSettings.height}p`}
            </output>
          </span>
          <input
            type="range"
            min="0"
            max={RESOLUTIONS.length - 1}
            step="1"
            value={RESOLUTIONS.indexOf(screenShareSettings.height)}
            disabled={sharingScreen}
            aria-label="Resolução da apresentação, de 480p a 4K"
            title="Resolução máxima desejada. O envio ajusta o bitrate conforme sua conexão e a quantidade de participantes."
            onChange={(event) => onScreenShareSettingsChange({
              ...screenShareSettings,
              height: RESOLUTIONS[Number(event.target.value)],
            })}
            className="mt-1.5 h-1.5 w-full cursor-pointer accent-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="mt-0.5 flex justify-between text-[9px] text-white/40"><span>480p</span><span>4K</span></span>
          <span className="mt-1 block text-[9px] text-white/40">adapta à conexão</span>
        </label>

        <label className="w-28 rounded-2xl border border-surface-border bg-surface-card px-3 py-2 text-xs text-white/75 sm:w-36">
          <span className="flex items-center justify-between gap-2">
            <span>Quadros</span>
            <output className="font-semibold text-white">{screenShareSettings.frameRate} fps</output>
          </span>
          <input
            type="range"
            min="0"
            max={FRAME_RATES.length - 1}
            step="1"
            value={FRAME_RATES.indexOf(screenShareSettings.frameRate)}
            disabled={sharingScreen}
            aria-label="Taxa de quadros da apresentação, de 30 a 120 fps"
            title="Taxa máxima desejada. O navegador e a conexão podem ajustá-la durante a apresentação."
            onChange={(event) => onScreenShareSettingsChange({
              ...screenShareSettings,
              frameRate: FRAME_RATES[Number(event.target.value)],
            })}
            className="mt-1.5 h-1.5 w-full cursor-pointer accent-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="mt-0.5 flex justify-between text-[9px] text-white/40"><span>30 fps</span><span>120 fps</span></span>
          <span className="mt-1 block text-[9px] text-white/40">adapta à conexão</span>
        </label>
      </div>

      <button
        onClick={onToggleParticipants}
        aria-label="Ver participantes"
        className="relative h-12 w-12 rounded-full bg-surface-card hover:bg-surface-border border border-surface-border flex items-center justify-center text-white transition-colors"
      >
        <PeopleIcon />
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-brand-500 text-[11px] font-semibold flex items-center justify-center">
          {participantCount}
        </span>
      </button>

      <button
        onClick={onToggleChat}
        aria-label={chatUnreadCount ? `Abrir chat, ${chatUnreadCount} mensagens não lidas` : 'Abrir chat da chamada'}
        title="Chat da chamada"
        className="relative h-12 w-12 rounded-full bg-surface-card hover:bg-surface-border border border-surface-border flex items-center justify-center text-white transition-colors"
      >
        <ChatIcon />
        {chatUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full bg-theme-gradient px-1 text-[10px] font-semibold flex items-center justify-center">
            {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
          </span>
        )}
      </button>

      <button
        onClick={handleCopy}
        aria-label="Copiar link de convite"
        className="h-12 px-4 rounded-full bg-surface-card hover:bg-surface-border border border-surface-border flex items-center gap-2 text-white text-sm font-medium transition-colors"
      >
        {copied ? <CheckIcon /> : <LinkIcon />}
        {copied ? 'Copiado' : 'Convidar'}
      </button>

      <button
        onClick={onLeave}
        aria-label="Sair da chamada"
        className="h-12 w-12 sm:w-auto sm:px-5 rounded-full bg-danger hover:bg-red-600 flex items-center justify-center gap-2 text-white font-semibold transition-colors"
      >
        <HangupIcon />
        <span className="hidden sm:inline">Sair</span>
      </button>
    </div>
  );
}

function ControlButton({
  active,
  danger,
  highlight,
  activeLabel,
  inactiveLabel,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  danger?: boolean;
  highlight?: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={active ? activeLabel : inactiveLabel}
      aria-pressed={!active}
      className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors border disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'bg-danger hover:bg-red-600 border-transparent text-white'
          : highlight
          ? 'bg-theme-gradient hover:brightness-110 border-transparent text-white'
          : 'bg-surface-card hover:bg-surface-border border-surface-border text-white'
      }`}
    >
      {children}
    </button>
  );
}
