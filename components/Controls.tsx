import { CamIcon, HangupIcon, MicIcon, ScreenShareIcon } from "./icons";

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

export type VoiceProfile = "standard" | "noise-suppression";

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

interface ControlsProps {
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
  inputDevices: AudioDeviceOption[];
  outputDevices: AudioDeviceOption[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  onSelectInputDevice: (deviceId: string) => void;
  onSelectOutputDevice: (deviceId: string) => void;
  inputVolume: number;
  outputVolume: number;
  onInputVolumeChange: (volume: number) => void;
  onOutputVolumeChange: (volume: number) => void;
  voiceProfile: VoiceProfile;
  onVoiceProfileChange: (profile: VoiceProfile) => void;
  outputDeviceSelectionSupported: boolean;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
  watchingPresentation: boolean;
  onStopWatching: () => void;
  onCopyLink: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onPlaySoundEffect: (effect: SoundboardEffect) => void;
}

export default function Controls({
  micOn,
  camOn,
  sharingScreen,
  micLockedByHost,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onLeave,
}: ControlsProps) {
  const buttonClass = "grid h-10 w-10 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:w-11";
  const inactiveClass = "bg-[#3b171b] text-[#f23f42] hover:bg-[#522025] hover:text-[#ff6567]";

  return (
    <div className="flex justify-center px-2">
      <div className="flex items-center gap-1.5 rounded-2xl border border-white/[0.07] bg-[#18191c]/95 p-1.5 shadow-xl backdrop-blur sm:gap-2 sm:p-2">
        <button
          type="button"
          onClick={onToggleMic}
          disabled={micLockedByHost}
          title={micLockedByHost ? "O anfitrião bloqueou seu microfone" : micOn ? "Silenciar microfone" : "Ativar microfone"}
          aria-label={micLockedByHost ? "Microfone bloqueado pelo anfitrião" : micOn ? "Silenciar microfone" : "Ativar microfone"}
          aria-pressed={!micOn}
          className={`${buttonClass} ${!micOn ? inactiveClass : "bg-[#292a2e]"}`}
        >
          <MicIcon off={!micOn} />
        </button>
        <button
          type="button"
          onClick={onToggleCam}
          title={camOn ? "Desativar câmera" : "Ativar câmera"}
          aria-label={camOn ? "Desativar câmera" : "Ativar câmera"}
          aria-pressed={!camOn}
          className={`${buttonClass} ${!camOn ? inactiveClass : "bg-[#292a2e]"}`}
        >
          <CamIcon off={!camOn} />
        </button>
        <button
          type="button"
          onClick={onToggleScreenShare}
          title={sharingScreen ? "Parar transmissão de tela" : "Transmitir tela"}
          aria-label={sharingScreen ? "Parar transmissão de tela" : "Transmitir tela"}
          aria-pressed={sharingScreen}
          className={`${buttonClass} ${sharingScreen ? "bg-[#5865f2] text-white hover:bg-[#4752c4]" : "bg-[#292a2e]"}`}
        >
          <ScreenShareIcon active={sharingScreen} />
        </button>
        <button
          type="button"
          onClick={onLeave}
          title="Sair da chamada"
          aria-label="Sair da chamada"
          className="grid h-10 w-11 place-items-center rounded-xl bg-[#da373c] text-white transition hover:bg-[#b92b30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 sm:h-11 sm:w-12"
        >
          <HangupIcon />
        </button>
      </div>
    </div>
  );
}
