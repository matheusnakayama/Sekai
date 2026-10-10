export type DisplaySurfaceChoice = 'window' | 'monitor' | 'browser';

/**
 * Opções do getDisplayMedia. Na tela inteira o áudio precisa ser o do sistema,
 * pedido como `true`. `restrictOwnAudio` deixa essa faixa muda no Chrome:
 * a faixa existe, mas o navegador a silencia quando não consegue separar o
 * som da aba do resto do computador.
 */
export function buildDisplayMediaRequest(
  surface: DisplaySurfaceChoice,
  shareAudio: boolean,
  video: MediaTrackConstraints,
) {
  const monitor = surface === 'monitor';
  const windowShare = surface === 'window';
  const browser = surface === 'browser';
  return {
    video: {
      ...video,
      displaySurface: surface,
    },
    audio: shareAudio ? (browser ? { restrictOwnAudio: true } : true) : false,
    systemAudio: shareAudio && monitor ? 'include' : 'exclude',
    windowAudio: shareAudio && windowShare ? 'window' : undefined,
    selfBrowserSurface: browser ? 'include' : 'exclude',
    monitorTypeSurfaces: monitor ? 'include' : 'exclude',
    surfaceSwitching: 'include',
  };
}

export async function prepareScreenAudioTrack(track: MediaStreamTrack, surface: DisplaySurfaceChoice | string) {
  track.contentHint = 'music';
  const constraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    ...(surface === 'browser' ? {} : { restrictOwnAudio: false }),
  };
  try {
    await track.applyConstraints(constraints as MediaTrackConstraints);
  } catch {
    // A captura de tela nem sempre aceita esses limites. A faixa segue crua.
  }
  return track;
}
