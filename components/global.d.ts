declare module "*.css" {}

interface SekaiDesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

interface SekaiOverlaySettings {
  enabled: boolean;
  opacity: number;
  scale: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  toggleShortcut: 'Control+Shift+F10' | 'Control+Shift+F9' | 'Alt+Shift+F10' | 'Alt+Shift+F9';
  showAvatars: boolean;
  showNames: boolean;
  maxParticipants: number;
}

interface SekaiOverlayParticipant {
  id: string;
  name: string;
  avatarUrl: string;
  isSpeaking: boolean;
  micOn: boolean;
}

interface SekaiOverlayCallState {
  callName: string;
  participants: SekaiOverlayParticipant[];
  accentColor?: string;
}

interface SekaiDesktop {
  listSources(kind: 'window' | 'screen'): Promise<SekaiDesktopSource[]>;
  prepareCapture(sourceId: string, shareAudio: boolean): void;
  // Optional so a newer hosted UI remains compatible with older installed Electron apps.
  getOverlaySettings?(): Promise<SekaiOverlaySettings>;
  updateOverlaySettings?(settings: SekaiOverlaySettings): Promise<SekaiOverlaySettings>;
  updateOverlayCall?(state: SekaiOverlayCallState): void;
  restoreCallFromOverlay?(): void;
  onOverlayState?(callback: (state: { settings: SekaiOverlaySettings; callName: string; participants: SekaiOverlayParticipant[] }) => void): () => void;
}

interface Window {
  sekaiDesktop?: SekaiDesktop;
}
