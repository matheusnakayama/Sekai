'use client';

import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { HangupIcon, MicIcon, ScreenShareIcon } from './icons';
import AnchoredPopover from './AnchoredPopover';

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

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export type VoiceProfile = 'standard' | 'noise-suppression';

export interface VoiceAudioSettings {
  inputDevices: AudioDeviceOption[];
  outputDevices: AudioDeviceOption[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  voiceProfile: VoiceProfile;
  outputDeviceSelectionSupported: boolean;
}

export default function Controls({
  micOn,
  sharingScreen,
  watchingPresentation,
  micLockedByHost,
  inputDevices,
  selectedInputDeviceId,
  onSelectInputDevice,
  onToggleMic,
  onToggleScreenShare,
  onLeave,
  onStopWatching,
}: {
  micOn: boolean;
  sharingScreen: boolean;
  watchingPresentation: boolean;
  micLockedByHost: boolean;
  inputDevices: AudioDeviceOption[];
  selectedInputDeviceId: string;
  onSelectInputDevice: (deviceId: string) => void;
  onToggleMic: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
  onStopWatching: () => void;
}) {
  const inputAnchorRef = useRef<HTMLDivElement>(null);
  const [inputMenuOpen, setInputMenuOpen] = useState(false);
  const presentationActive = sharingScreen || watchingPresentation;

  return (
    <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#17181d]/95 p-1.5 text-white shadow-2xl backdrop-blur-xl">
      <div ref={inputAnchorRef} className="relative flex items-center gap-0.5">
        <ControlButton
          active={micOn}
          activeLabel="Silenciar microfone"
          inactiveLabel="Ativar microfone"
          onClick={onToggleMic}
          danger={!micOn}
          disabled={micLockedByHost}
          title={micLockedByHost
            ? 'O anfitrião bloqueou seu microfone'
            : micOn ? 'Silenciar microfone' : 'Ativar microfone'}
        >
          <MicIcon off={!micOn} />
        </ControlButton>
        <button
          type="button"
          aria-label="Selecionar microfone"
          aria-haspopup="dialog"
          aria-expanded={inputMenuOpen}
          title="Selecionar microfone"
          onClick={() => setInputMenuOpen((open) => !open)}
          className="grid h-12 w-8 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.04] text-white/60 transition hover:bg-white/[0.09] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <AnchoredPopover
          open={inputMenuOpen}
          anchorRef={inputAnchorRef}
          width={280}
          className="rounded-xl border border-white/10 bg-[#202126] p-3 text-white shadow-2xl"
        >
          <section role="dialog" aria-label="Selecionar microfone">
            <h3 className="px-1 text-sm font-semibold">Microfone</h3>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {inputDevices.length ? inputDevices.map((device) => (
                <AudioOption
                  key={device.deviceId}
                  label={device.label}
                  selected={device.deviceId === selectedInputDeviceId}
                  onClick={() => {
                    onSelectInputDevice(device.deviceId);
                    setInputMenuOpen(false);
                  }}
                />
              )) : (
                <p className="px-2 py-2 text-xs text-white/50">Nenhum microfone encontrado</p>
              )}
            </div>
          </section>
        </AnchoredPopover>
      </div>

      <ControlButton
        active={!presentationActive}
        activeLabel="Apresentar tela"
        inactiveLabel={watchingPresentation ? 'Parar de assistir à apresentação' : 'Parar apresentação'}
        onClick={watchingPresentation ? onStopWatching : onToggleScreenShare}
        highlight={presentationActive}
        title={watchingPresentation
          ? 'Parar de assistir à apresentação'
          : sharingScreen ? 'Parar apresentação' : 'Apresentar tela'}
      >
        <ScreenShareIcon active={sharingScreen} />
      </ControlButton>

      <span aria-hidden="true" className="mx-0.5 h-7 w-px bg-white/10" />

      <button
        type="button"
        onClick={onLeave}
        aria-label="Sair da chamada"
        title="Sair da chamada"
        className="grid h-12 w-12 place-items-center rounded-xl bg-[#ed344b] text-white transition hover:bg-[#d92b42] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <HangupIcon />
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={active ? activeLabel : inactiveLabel}
      aria-pressed={!active}
      className={`grid h-12 w-12 place-items-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'border-red-500/20 bg-[#3a171d] text-red-400 hover:bg-[#4a1b23]'
          : highlight
            ? 'border-brand-400/30 bg-brand-500/15 text-brand-200 hover:bg-brand-500/25'
            : 'border-white/[0.06] bg-white/[0.04] text-white/85 hover:bg-white/[0.09]'
      }`}
    >
      {children}
    </button>
  );
}

function AudioOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition ${
        selected ? 'bg-brand-500/20 text-white' : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <span className="truncate">{label}</span>
      {selected && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />}
    </button>
  );
}
