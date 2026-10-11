export type DisplaySurfaceChoice = 'window' | 'monitor' | 'browser';

export function screenShareFailureMessage(error: unknown, desktopSelection = false) {
  const value = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown } : null;
  const name = typeof value?.name === 'string' && value.name ? value.name : 'desconhecido';
  const reasons: Record<string, string> = {
    NotAllowedError: 'O acesso à captura foi recusado pelo navegador ou pelo sistema. Se você fechou o seletor, pode ignorar este aviso; caso contrário, confirme a permissão de compartilhar tela e verifique bloqueios de privacidade, segurança ou política do PC.',
    NotReadableError: 'O sistema operacional não conseguiu capturar a tela selecionada. Esse código aponta para um bloqueio ou falha no nível do PC; verifique o driver de vídeo, antivírus, sessão de área de trabalho remota ou outro programa capturando a tela.',
    NotFoundError: 'Nenhuma tela ou janela disponível foi encontrada. Abra a janela que deseja transmitir e escolha a fonte novamente.',
    AbortError: 'A captura foi interrompida pelo navegador ou pelo sistema. Se você não cancelou o seletor, verifique bloqueios do sistema, programas de captura de tela e tente escolher outra janela ou monitor.',
    InvalidStateError: 'O navegador não conseguiu abrir a captura porque a janela da chamada perdeu o foco. Volte para a chamada e tente novamente pelo botão de apresentar tela.',
    OverconstrainedError: 'A tela não aceitou a qualidade de vídeo escolhida. Reduza a resolução ou a taxa de quadros e tente novamente.',
    TypeError: 'O navegador recusou as opções de captura solicitadas. Atualize o navegador ou escolha outra fonte de compartilhamento.',
  };
  const reason = reasons[name]
    ?? (typeof value?.message === 'string' && value.message.trim()
      ? `O navegador informou: ${value.message.trim().slice(0, 240)}`
      : 'O navegador ou o sistema não conseguiu iniciar a captura. Verifique as permissões de tela e tente novamente.');
  const source = desktopSelection ? 'a janela ou tela selecionada' : 'a tela';
  return `Sua apresentação não foi iniciada: ${source}. Motivo: ${reason} (código: ${name}).`;
}

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
