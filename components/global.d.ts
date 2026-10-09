declare module "*.css" {}

interface SekaiDesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

interface SekaiDesktop {
  listSources(kind: 'window' | 'screen'): Promise<SekaiDesktopSource[]>;
  prepareCapture(sourceId: string, shareAudio: boolean): void;
}

interface Window {
  sekaiDesktop?: SekaiDesktop;
}
