'use client';

import { useRef, useState } from 'react';
import { Music, Music2, Play, Square, Volume2, VolumeX } from 'lucide-react';
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

export default function Controls({
  micOn,
  deafened,
  camOn,
  sharingScreen,
  participantCount,
  chatUnreadCount,
  isHost,
  micLockedByHost,
  soundEffects,
  soundEffectsLoading,
  playingSoundId,
  callMusicName,
  onPlayCallMusic,
  onStopCallMusic,
  onToggleMic,
  onToggleDeafen,
  onToggleCam,
  onToggleScreenShare,
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
  participantCount: number;
  chatUnreadCount: number;
  isHost: boolean;
  micLockedByHost: boolean;
  soundEffects: SoundboardEffect[];
  soundEffectsLoading: boolean;
  playingSoundId: string | null;
  callMusicName: string | null;
  onPlayCallMusic: (file: File) => void;
  onStopCallMusic: () => void;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
  onCopyLink: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onPlaySoundEffect: (effect: SoundboardEffect) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const musicFileRef = useRef<HTMLInputElement>(null);

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
                <p className="mt-0.5 text-[11px] text-white/50">Para membros online do servidor, mesmo fora da call.</p>
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
                    title={`Reproduzir ${effect.name} para o servidor`}
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

      <div className="relative">
        <button
          type="button"
          onClick={() => setMusicOpen((open) => !open)}
          aria-label="Tocar uma música na call"
          aria-expanded={musicOpen}
          title="Tocar música na call"
          className={`h-12 w-12 rounded-full border flex items-center justify-center transition-colors ${callMusicName || musicOpen ? 'border-brand-400/50 bg-brand-500/20 text-white' : 'border-surface-border bg-surface-card text-white/80 hover:bg-surface-border'}`}
        >
          <Music className="h-5 w-5" />
        </button>
        {musicOpen && (
          <div className="absolute bottom-full right-0 z-50 mb-3 w-80 max-w-[calc(100vw_-_2rem)] rounded-2xl border border-surface-border bg-[#17191f] p-3 text-white shadow-2xl">
            <h3 className="px-1 text-sm font-semibold">Música na call</h3>
            <p className="mt-1 px-1 text-[11px] leading-relaxed text-white/50">Escolha um arquivo de áudio do seu computador. Quem estiver nesta call escuta junto.</p>
            <input
              ref={musicFileRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                onPlayCallMusic(file);
                setMusicOpen(false);
              }}
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => musicFileRef.current?.click()} className="flex-1 rounded-xl bg-theme-gradient px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110">Escolher arquivo</button>
              {callMusicName && <button type="button" onClick={onStopCallMusic} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"><Square className="h-3 w-3 fill-current" />Parar</button>}
            </div>
          </div>
        )}
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

      {callMusicName && (
        <div className="flex basis-full items-center justify-center gap-2 pt-1 text-xs text-white/75">
          <Music className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[240px] truncate">Tocando {callMusicName}</span>
          <button type="button" onClick={onStopCallMusic} className="rounded-lg px-2 py-1 font-semibold text-white transition hover:bg-white/10">Parar</button>
        </div>
      )}
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
