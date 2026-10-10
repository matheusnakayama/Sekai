import type { IceServerConfig } from '@/lib/types';

/** Uma checagem lenta (várias placas de rede, NAT restritivo) ainda pode concluir. */
export const VOICE_CHECKING_GRACE_MS = 20_000;
export const VOICE_DISCONNECTED_GRACE_MS = 6_000;
/** A apresentação deixa de ser reiniciada enquanto o envio ainda está abrindo. */
export const SCREEN_CONNECT_GRACE_MS = 12_000;
/** O Pusher descarta evento de cliente acima de 10 KB. Sobramos margem para o envelope. */
export const SIGNAL_BYTE_BUDGET = 9_000;

export type RecoveryDecision = {
  action: 'keep' | 'reset' | 'request';
  relay: boolean;
  delayMs: number;
};

export type ScreenReplayDecision =
  | { kind: 'stop' }
  | { kind: 'wait'; ms: number }
  | { kind: 'replay'; relay: boolean };

function serverUrls(server: IceServerConfig): string[] {
  return Array.isArray(server.urls) ? server.urls : [server.urls];
}

export function hasTurnUrl(servers: IceServerConfig[]): boolean {
  return servers.some((server) => serverUrls(server).some((url) => /^turns?:/i.test(url)));
}

export function relayIceServers(servers: IceServerConfig[]): IceServerConfig[] {
  return servers.filter((server) => serverUrls(server).some((url) => /^turns?:/i.test(url)));
}

/**
 * Oferta de uma geração anterior é resto de uma conexão já substituída.
 * Geração ausente é um cliente antigo: aceita do mesmo jeito.
 */
export function signalGenerationAction(localGeneration: number, incoming: number | undefined): 'apply' | 'ignore' | 'replace' {
  if (incoming === undefined) return 'apply';
  if (incoming < localGeneration) return 'ignore';
  if (incoming > localGeneration) return 'replace';
  return 'apply';
}

export function voiceRecoveryDecision(options: {
  localIsOfferer: boolean;
  connectionState: string;
  iceConnectionState: string;
  ageMs: number;
  attempt: number;
  hasTurn: boolean;
  disconnectedForMs: number | null;
}): RecoveryDecision {
  if (
    options.connectionState === 'connected' ||
    options.iceConnectionState === 'connected' ||
    options.iceConnectionState === 'completed'
  ) {
    return { action: 'keep', relay: false, delayMs: 0 };
  }

  const failed = options.connectionState === 'failed' || options.iceConnectionState === 'failed';
  const checking = !failed && (
    options.connectionState === 'new' ||
    options.connectionState === 'connecting' ||
    options.iceConnectionState === 'new' ||
    options.iceConnectionState === 'checking'
  );

  if (checking && options.ageMs < VOICE_CHECKING_GRACE_MS) {
    return { action: 'keep', relay: false, delayMs: Math.max(250, VOICE_CHECKING_GRACE_MS - options.ageMs) };
  }
  if (!failed && options.disconnectedForMs !== null && options.disconnectedForMs < VOICE_DISCONNECTED_GRACE_MS) {
    return {
      action: 'keep',
      relay: false,
      delayMs: Math.max(250, VOICE_DISCONNECTED_GRACE_MS - options.disconnectedForMs),
    };
  }

  return {
    action: options.localIsOfferer ? 'reset' : 'request',
    relay: options.hasTurn,
    delayMs: Math.min(20_000, 8_000 + options.attempt * 4_000),
  };
}

/** A mesma tela, ainda abrindo ou já ligada, não deve ser derrubada. */
export function screenLinkReusable(state: string, ageMs: number, sameTracks: boolean): boolean {
  if (!sameTracks) return false;
  if (state === 'connected') return true;
  if ((state === 'new' || state === 'connecting' || state === 'disconnected') && ageMs < SCREEN_CONNECT_GRACE_MS) return true;
  return false;
}

export function nextScreenReplay(state: string | null, ageMs: number, live: boolean, frameAsks: number): ScreenReplayDecision {
  if (live) return { kind: 'stop' };
  if (state === 'connected') {
    return frameAsks >= 2 ? { kind: 'replay', relay: true } : { kind: 'replay', relay: false };
  }
  if (state === 'new' || state === 'connecting' || state === 'disconnected') {
    if (ageMs < SCREEN_CONNECT_GRACE_MS) {
      return { kind: 'wait', ms: Math.max(250, SCREEN_CONNECT_GRACE_MS - ageMs) };
    }
    return { kind: 'replay', relay: true };
  }
  if (!state) {
    if (ageMs < 4_000) return { kind: 'wait', ms: Math.max(250, 4_000 - ageMs) };
    return { kind: 'replay', relay: ageMs >= SCREEN_CONNECT_GRACE_MS };
  }
  return { kind: 'replay', relay: true };
}

/** O pedido de replay não reinicia um envio que ainda está no prazo, nem uma imagem que já chegou. */
export function screenReplayResponse(state: string | null, ageMs: number, relayRequested: boolean): 'ignore' | 'keyframe' | 'replace' {
  if (state === 'connected' && !relayRequested) return 'keyframe';
  if ((state === 'new' || state === 'connecting' || state === 'disconnected') && ageMs < SCREEN_CONNECT_GRACE_MS) return 'ignore';
  return 'replace';
}

export function candidateKey(candidate: RTCIceCandidateInit): string {
  return `${candidate.sdpMid ?? ''}|${candidate.sdpMLineIndex ?? ''}|${candidate.candidate ?? ''}`;
}

export function chunkCandidates(candidates: RTCIceCandidateInit[], budget = 8_000): RTCIceCandidateInit[][] {
  const chunks: RTCIceCandidateInit[][] = [];
  let current: RTCIceCandidateInit[] = [];
  let size = 2;
  for (const candidate of candidates) {
    const bytes = JSON.stringify(candidate).length + 1;
    if (current.length && size + bytes > budget) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(candidate);
    size += bytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Tira os candidatos de dentro do SDP quando o evento não cabe no Pusher.
 * Eles seguem em mensagens separadas, então a oferta deixa de ser descartada
 * por inteiro numa máquina com muitas placas de rede.
 */
export function shrinkSessionDescription(
  description: RTCSessionDescriptionInit,
  envelope: object,
  budget = SIGNAL_BYTE_BUDGET,
): RTCSessionDescriptionInit {
  if (!description.sdp) return description;
  if (JSON.stringify({ ...envelope, sdp: description }).length <= budget) return description;
  const eol = description.sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = description.sdp.split(/\r\n|\n/).filter((line) => !line.startsWith('a=candidate:') && line !== 'a=end-of-candidates');
  let sdp = lines.join(eol);
  if (sdp && !sdp.endsWith(eol)) sdp += eol;
  return { ...description, sdp };
}
