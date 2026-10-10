'use client';

import type { Channel } from 'pusher-js';
import {
  SCREEN_CONNECT_GRACE_MS,
  VOICE_CHECKING_GRACE_MS,
  candidateKey,
  chunkCandidates,
  hasTurnUrl,
  nextScreenReplay,
  relayIceServers,
  screenLinkReusable,
  screenReplayResponse,
  shrinkSessionDescription,
  signalGenerationAction,
  voiceRecoveryDecision,
} from '@/lib/callRecovery';
import { advanceVoiceGate, createVoiceGate, voiceDescription } from '@/lib/voiceCapture';
import type { IceServerConfig, SignalPayload } from './types';

type TrackHandler = (peerId: string, stream: MediaStream) => void;
type SoundboardTrackHandler = (peerId: string, track: MediaStreamTrack) => void;
type ConnectionStateHandler = (peerId: string, state: RTCPeerConnectionState) => void;
type SpeakingHandler = (peerId: string, speaking: boolean) => void;
type ScreenShareHandler = (peerId: string, sharing: boolean) => void;
type MediaStateHandler = (peerId: string, state: { micOn: boolean; camOn: boolean }) => void;

export interface VideoSenderProfile {
  maxBitrate: number;
  maxFramerate: number;
  width?: number;
  height?: number;
  /** Limite total desejado antes de dividir cópias entre os participantes. */
  totalBitrate?: number;
}

interface PeerEntry {
  connection: RTCPeerConnection;
  remoteStream?: MediaStream;
  makingOffer: boolean;
  initialOfferStarted: boolean;
  negotiationQueued: boolean;
  polite: boolean;
  settingRemoteAnswerPending: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  iceRestartQueued: boolean;
  recoveryAttempts: number;
  recoveryTimer?: number;
  generation: number;
  useRelay: boolean;
  attemptStartedAt: number;
  disconnectedAt?: number;
  disconnectTimer?: number;
  localCandidates: RTCIceCandidateInit[];
  flushedCandidateCount: number;
  appliedCandidates: Set<string>;
  candidateFlushTimer?: number;
  initialCallFallbackTimer?: number;
  offerRetryTimer?: number;
  offerRetryAttempts: number;
  resetting: boolean;
  videoArrivalTimer?: number;
  videoProfileReady?: Promise<void>;
  mediaTracksReady?: Promise<void>;
  audioTransceiver?: RTCRtpTransceiver;
  videoTransceiver?: RTCRtpTransceiver;
  videoSender?: RTCRtpSender;
  soundboardTransceiver?: RTCRtpTransceiver;
  soundboardTrackReady?: Promise<void>;
  videoProfile?: VideoSenderProfile | null;
  videoParametersChain: Promise<void>;
  retryNegotiation?: () => void;
}

interface ScreenLink {
  connection: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  generation: number;
  openedAt: number;
  localCandidates: RTCIceCandidateInit[];
  flushedCandidateCount: number;
  appliedCandidates: Set<string>;
  candidateFlushTimer?: number;
  watchTimer?: number;
}

interface EarlyScreenIce {
  candidate: RTCIceCandidateInit;
  generation: number;
}

interface SpeakingWatcher {
  ctx: AudioContext;
  analyser: AnalyserNode;
  raf: number;
  cloned: MediaStreamTrack | null;
}

/**
 * A voz fica numa conexão por participante. A apresentação não renegocia essa
 * conexão: abre um envio separado, só de ida, com a tela já no primeiro offer.
 * Assim quem já estava na sala recebe a imagem do mesmo jeito que quem entra
 * depois. A sinalização trafega pelo canal de presença do Pusher.
 */
export class WebRTCManager {
  private peers = new Map<string, PeerEntry>();
  private speakingWatchers = new Map<string, SpeakingWatcher>();
  private localStream: MediaStream | null = null;
  private hasAudioTrackOverride = false;
  private audioTrackOverride: MediaStreamTrack | null = null;
  private soundboardTrackOverride: MediaStreamTrack | null = null;
  private hasVideoTrackOverride = false;
  private videoTrackOverride: MediaStreamTrack | null = null;
  private videoProfileOverride: VideoSenderProfile | null = null;
  private videoReplaceChain: Promise<void> = Promise.resolve();
  private audioReplaceChain: Promise<void> = Promise.resolve();
  private outgoingScreen = new Map<string, ScreenLink>();
  private incomingScreen = new Map<string, ScreenLink>();
  private remoteStreams = new Map<string, MediaStream>();
  private remoteScreenByPeer = new Map<string, Set<string>>();
  private remoteScreenTrackIds = new Set<string>();
  private voiceVideoByPeer = new Map<string, MediaStreamTrack>();
  private earlyScreenIce = new Map<string, EarlyScreenIce[]>();
  private screenReplayTimers = new Map<string, number>();
  private screenSendRetries = new Map<string, number>();
  private screenRelayPeers = new Set<string>();
  private screenFrameAsks = new Map<string, number>();
  private earlyVoiceIce = new Map<string, RTCIceCandidateInit[]>();
  private watchedRemoteTracks = new WeakSet<MediaStreamTrack>();
  private screenActive = false;
  private screenTrack: MediaStreamTrack | null = null;
  private screenAudioTrack: MediaStreamTrack | null = null;
  private screenProfile: VideoSenderProfile | null = null;
  private iceServers: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private channel: Channel;
  private localId: string;

  onTrack: TrackHandler = () => {};
  onSoundboardTrack: SoundboardTrackHandler = () => {};
  onScreenAudioTrack: (peerId: string, track: MediaStreamTrack | null) => void = () => {};
  onConnectionStateChange: ConnectionStateHandler = () => {};
  onSpeakingChange: SpeakingHandler = () => {};
  onScreenShareState: ScreenShareHandler = () => {};
  onMediaState: MediaStateHandler = () => {};

  constructor(channel: Channel, localId: string) {
    this.channel = channel;
    this.localId = localId;
    this.channel.bind('client-signal', (payload: SignalPayload) => {
      if ('to' in payload && payload.to !== this.localId) return;
      this.handleSignal(payload);
    });
  }

  setIceServers(servers: IceServerConfig[]) {
    if (servers.length) this.iceServers = servers;
  }

  setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    this.watchSpeaking(this.localId, stream);
  }

  /** Prepara o par e dá um início alternativo caso a oferta inicial se perca. */
  preparePeerConnection(peerId: string) {
    const pc = this.ensurePeerConnection(peerId);
    const peer = this.peers.get(peerId);
    if (!peer || peer.initialCallFallbackTimer !== undefined) return;

    peer.initialCallFallbackTimer = window.setTimeout(() => {
      peer.initialCallFallbackTimer = undefined;
      if (this.peers.get(peerId) !== peer || pc.connectionState === 'connected') return;
      if (pc.signalingState !== 'stable' || pc.remoteDescription || peer.initialOfferStarted) return;
      // Normalmente só o ID menor inicia. Se não chegou oferta, este lado faz
      // uma tentativa de reserva para que a pessoa não fique presa conectando.
      void this.callPeer(peerId).catch((error) => {
        console.warn('Não foi possível iniciar a conexão de reserva:', error);
      });
    }, 8_000);
  }

  /** Cria uma nova conexão e envia uma oferta (usado quando ALGUÉM ENTRA depois de mim, ou quando EU acabei de entrar e preciso chamar quem já está lá). */
  async callPeer(peerId: string) {
    const pc = this.ensurePeerConnection(peerId);
    const peer = this.peers.get(peerId);
    if (!peer) return;
    // Apenas um offer inicial por par: se a outra ponta já iniciou a conexão,
    // não crie uma segunda oferta concorrente.
    if (peer.initialOfferStarted || peer.makingOffer || pc.signalingState !== 'stable' || pc.remoteDescription) return;
    peer.initialOfferStarted = true;
    peer.makingOffer = true;
    try {
      await this.videoReplaceChain;
      await peer.videoProfileReady;
      await peer.mediaTracksReady;
      await peer.soundboardTrackReady;
      const offer = voiceDescription(await pc.createOffer());
      await pc.setLocalDescription(offer);
      peer.attemptStartedAt = Date.now();
      this.send({
        type: 'offer',
        from: this.localId,
        to: peerId,
        sdp: pc.localDescription ?? offer,
        generation: peer.generation,
        relay: peer.useRelay,
      });
      this.resendVoiceCandidates(peerId, peer);
      this.scheduleOfferRetry(peerId, peer, 5_000);
      this.scheduleRecovery(peerId, peer, 8_000);
    } catch (error) {
      peer.initialOfferStarted = false;
      throw error;
    } finally {
      peer.makingOffer = false;
      if (peer.negotiationQueued) this.requestRenegotiation(peerId, peer);
    }
  }

  hangupPeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (entry) {
      if (entry.recoveryTimer !== undefined) window.clearTimeout(entry.recoveryTimer);
      if (entry.initialCallFallbackTimer !== undefined) window.clearTimeout(entry.initialCallFallbackTimer);
      if (entry.offerRetryTimer !== undefined) window.clearTimeout(entry.offerRetryTimer);
      if (entry.videoArrivalTimer !== undefined) window.clearTimeout(entry.videoArrivalTimer);
      if (entry.disconnectTimer !== undefined) window.clearTimeout(entry.disconnectTimer);
      if (entry.candidateFlushTimer !== undefined) window.clearTimeout(entry.candidateFlushTimer);
      if (entry.retryNegotiation) {
        entry.connection.removeEventListener('signalingstatechange', entry.retryNegotiation);
        entry.connection.removeEventListener('connectionstatechange', entry.retryNegotiation);
      }
      // As faixas locais são compartilhadas entre todas as conexões da sala.
      // Fechar uma conexão não pode encerrar o microfone/câmera dos demais pares.
      entry.connection.close();
      this.peers.delete(peerId);
    }
    this.closeOutgoingScreen(peerId);
    this.closeIncomingScreen(peerId);
    this.clearScreenReplay(peerId);
    this.screenRelayPeers.delete(peerId);
    this.screenFrameAsks.delete(peerId);
    this.remoteStreams.delete(peerId);
    this.voiceVideoByPeer.delete(peerId);
    const screenIds = this.remoteScreenByPeer.get(peerId);
    screenIds?.forEach((id) => this.remoteScreenTrackIds.delete(id));
    this.remoteScreenByPeer.delete(peerId);
    const watcher = this.speakingWatchers.get(peerId);
    if (watcher) {
      cancelAnimationFrame(watcher.raf);
      watcher.ctx.close().catch(() => {});
      this.speakingWatchers.delete(peerId);
    }

    // Quando alguém sai durante uma apresentação, redistribua o limite de
    // bitrate entre os destinatários que ainda estão conectados. Sem isso,
    // cada sender continua preso ao valor reduzido da sala maior.
    if (entry && (this.videoProfileOverride || this.screenProfile)) this.rebalanceVideoSenders();
  }

  hangupAll() {
    const wasSharing = this.screenActive;
    this.videoProfileOverride = null;
    this.screenActive = false;
    this.screenTrack = null;
    this.screenAudioTrack = null;
    this.screenProfile = null;
    if (wasSharing) this.send({ type: 'screen-stop', from: this.localId });
    this.stopOutgoingScreens();
    Array.from(this.incomingScreen.keys()).forEach((id) => this.closeIncomingScreen(id));
    Array.from(this.peers.keys()).forEach((id) => this.hangupPeer(id));
  }

  /**
   * Abre a apresentação para quem entrou no meio dela. A oferta já sai com a
   * tela; a voz desse participante continua na conexão que já existia.
   */
  async offerScreenTo(peerId: string) {
    await this.videoReplaceChain;
    if (!this.screenActive || this.screenTrack?.readyState !== 'live') return;
    await this.offerScreen(peerId);
  }

  /** Câmera continua na conexão de voz. A tela abre um envio separado, só de ida. */
  replaceVideoTrack(
    track: MediaStreamTrack | null,
    _stream?: MediaStream | null,
    profile: VideoSenderProfile | null = null,
    screenAudio: MediaStreamTrack | null = null,
  ) {
    const update = this.videoReplaceChain.then(async () => {
      if (profile && track) {
        this.screenActive = true;
        this.screenTrack = track;
        this.screenAudioTrack = screenAudio?.readyState === 'live' ? screenAudio : null;
        this.screenProfile = profile;
        for (const peer of this.peers.values()) {
          if (peer.connection.signalingState === 'closed') continue;
          await peer.mediaTracksReady;
          const transceiver = peer.videoTransceiver ?? peer.connection.getTransceivers().find((candidate) => candidate.receiver.track.kind === 'video');
          if (!transceiver?.sender.track) continue;
          peer.videoTransceiver = transceiver;
          await transceiver.sender.replaceTrack(null);
        }
        const viewers = Array.from(this.peers.keys());
        await Promise.all(viewers.map((peerId) => this.offerScreen(peerId, true)));
        return;
      }

      if (this.screenActive) {
        this.screenActive = false;
        this.screenTrack = null;
        this.screenAudioTrack = null;
        this.screenProfile = null;
        this.stopOutgoingScreens();
        this.send({ type: 'screen-stop', from: this.localId });
      }

      this.hasVideoTrackOverride = true;
      this.videoTrackOverride = track;
      this.videoProfileOverride = null;

      for (const peer of this.peers.values()) {
        const { connection } = peer;
        if (connection.signalingState === 'closed') continue;
        await peer.mediaTracksReady;
        const transceiver = peer.videoTransceiver ?? connection.getTransceivers().find((candidate) => candidate.receiver.track.kind === 'video');
        if (!transceiver) continue;
        peer.videoTransceiver = transceiver;
        await transceiver.sender.replaceTrack(track);
      }
    });
    this.videoReplaceChain = update.catch(() => {});
    return update;
  }

  replaceAudioTrack(track: MediaStreamTrack | null) {
    this.hasAudioTrackOverride = true;
    this.audioTrackOverride = track;

    const update = this.audioReplaceChain.then(async () => {
      for (const peer of this.peers.values()) {
        if (peer.connection.signalingState === 'closed') continue;
        await peer.mediaTracksReady;
        const transceiver = peer.audioTransceiver ?? peer.connection.getTransceivers().find((candidate) => candidate.receiver.track.kind === 'audio' && candidate !== peer.soundboardTransceiver);
        if (!transceiver) continue;
        peer.audioTransceiver = transceiver;
        await transceiver.sender.replaceTrack(track);
      }
    });
    this.audioReplaceChain = update.catch(() => {});
    return update;
  }

  async replaceSoundboardTrack(track: MediaStreamTrack | null) {
    this.soundboardTrackOverride = track;
    for (const peer of this.peers.values()) {
      const { connection } = peer;
      if (connection.signalingState === 'closed') continue;
      const transceiver = peer.soundboardTransceiver ?? connection.addTransceiver('audio', { direction: 'sendrecv' });
      peer.soundboardTransceiver = transceiver;
      const update = (peer.soundboardTrackReady ?? Promise.resolve())
        .catch(() => {})
        .then(() => transceiver.sender.replaceTrack(track));
      peer.soundboardTrackReady = update;
      await update;
    }
  }

  broadcastScreenShareState(sharing: boolean) {
    this.send({ type: 'screen-share-state', from: this.localId, sharing });
  }

  broadcastMediaState(state: { micOn: boolean; camOn: boolean }) {
    this.send({ type: 'media-state', from: this.localId, ...state });
  }

  private ensurePeerConnection(peerId: string, options?: { generation?: number; useRelay?: boolean }): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing.connection;

    const useRelay = options?.useRelay ?? false;
    const pc = new RTCPeerConnection(this.rtcConfig(useRelay));
    const peer: PeerEntry = {
      connection: pc,
      makingOffer: false,
      initialOfferStarted: false,
      negotiationQueued: false,
      polite: this.localId > peerId,
      settingRemoteAnswerPending: false,
      ignoreOffer: false,
      pendingCandidates: [],
      iceRestartQueued: false,
      recoveryAttempts: 0,
      offerRetryAttempts: 0,
      resetting: false,
      generation: options?.generation ?? 1,
      useRelay,
      attemptStartedAt: Date.now(),
      localCandidates: [],
      flushedCandidateCount: 0,
      appliedCandidates: new Set(),
      videoParametersChain: Promise.resolve(),
    };
    this.peers.set(peerId, peer);
    peer.pendingCandidates.push(...this.takeEarlyVoiceIce(peerId, peer.generation));

    const localTracks = this.localStream?.getTracks() ?? [];
    const localAudioTrack = localTracks.find((track) => track.kind === 'audio') ?? null;
    const localVideoTrack = localTracks.find((track) => track.kind === 'video') ?? null;
    const audioTrack = this.hasAudioTrackOverride ? this.audioTrackOverride : localAudioTrack;
    // Durante a apresentação a câmera não vai na conexão de voz. A tela sai
    // numa conexão separada, então quem já estava na sala não depende de
    // renegociar a faixa de vídeo vazia.
    const videoTrack = this.screenActive
      ? null
      : (this.hasVideoTrackOverride ? this.videoTrackOverride : localVideoTrack);
    // Crie as seções de mídia sempre na mesma ordem em todos os pares. Com
    // addTrack(), a ordem mudava conforme câmera/microfone disponíveis, fazendo
    // o áudio do soundboard cair no m-line de vídeo em algumas chamadas.
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    const soundboardTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.audioTransceiver = audioTransceiver;
    peer.videoTransceiver = videoTransceiver;
    peer.soundboardTransceiver = soundboardTransceiver;
    const initialTrackChanges: Promise<void>[] = [];
    if (audioTrack) initialTrackChanges.push(audioTransceiver.sender.replaceTrack(audioTrack));
    if (videoTrack) initialTrackChanges.push(videoTransceiver.sender.replaceTrack(videoTrack));
    peer.mediaTracksReady = Promise.all(initialTrackChanges).then(() => {});
    if (this.soundboardTrackOverride) {
      peer.soundboardTrackReady = soundboardTransceiver.sender.replaceTrack(this.soundboardTrackOverride).then(() => {});
    }
    if (this.videoProfileOverride) {
      peer.videoProfileReady = this.configureVideoSender(
        videoTransceiver.sender,
        this.profileForCurrentPeerCount(this.videoProfileOverride),
        peer
      );
    }

    if (this.videoProfileOverride) {
      // Se outra pessoa entrar durante a apresentação, divide novamente o
      // limite agregado entre todas as cópias de vídeo enviadas pela sala.
      for (const existingPeer of this.peers.values()) {
        if (existingPeer === peer) continue;
        const sender = existingPeer.connection.getSenders().find((candidate) => candidate.track?.kind === 'video');
        if (sender) void this.configureVideoSender(sender, this.profileForCurrentPeerCount(this.videoProfileOverride), existingPeer);
      }
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate || this.peers.get(peerId) !== peer) return;
      this.queueVoiceCandidate(peerId, peer, event.candidate.toJSON());
    };

    pc.ontrack = (event) => {
      // A voz é só a primeira seção de áudio. Qualquer outra (soundboard, ou
      // uma seção que o navegador reordenou) não pode substituir o microfone
      // remoto — senão o tile fica com uma faixa muda e o amigo não é ouvido.
      if (event.track.kind === 'audio' && event.transceiver !== peer.audioTransceiver) {
        this.onSoundboardTrack(peerId, event.track);
        return;
      }
      this.addRemoteTrack(peerId, event.track, 'voice');
    };

    const onPeerState = () => this.handlePeerState(peerId, peer);
    pc.onconnectionstatechange = onPeerState;
    pc.oniceconnectionstatechange = onPeerState;

    if (this.screenActive && this.screenTrack?.readyState === 'live') {
      this.rebalanceVideoSenders();
      void this.offerScreen(peerId);
    }

    return pc;
  }

  private requestRenegotiation(peerId: string, peer: PeerEntry) {
    const pc = peer.connection;
    peer.negotiationQueued = true;

    if (peer.makingOffer) return;
    if (pc.signalingState !== 'stable' || (pc.connectionState !== 'connected' && !peer.iceRestartQueued)) {
      if (!peer.retryNegotiation) {
        peer.retryNegotiation = () => {
          if (pc.signalingState === 'stable' && (pc.connectionState === 'connected' || peer.iceRestartQueued)) {
            pc.removeEventListener('signalingstatechange', peer.retryNegotiation!);
            pc.removeEventListener('connectionstatechange', peer.retryNegotiation!);
            peer.retryNegotiation = undefined;
            this.requestRenegotiation(peerId, peer);
          } else if (pc.signalingState === 'closed' || (pc.connectionState === 'failed' && !peer.iceRestartQueued)) {
            pc.removeEventListener('signalingstatechange', peer.retryNegotiation!);
            pc.removeEventListener('connectionstatechange', peer.retryNegotiation!);
            peer.retryNegotiation = undefined;
          }
        };
        pc.addEventListener('signalingstatechange', peer.retryNegotiation);
        pc.addEventListener('connectionstatechange', peer.retryNegotiation);
      }
      return;
    }

    peer.negotiationQueued = false;
    peer.makingOffer = true;
    void (async () => {
      try {
        const restartingIce = peer.iceRestartQueued;
        const offer = voiceDescription(await pc.createOffer(restartingIce ? { iceRestart: true } : undefined));
        if (pc.signalingState !== 'stable') {
          peer.negotiationQueued = true;
          return;
        }
        await pc.setLocalDescription(offer);
        peer.iceRestartQueued = false;
        this.send({
          type: 'offer',
          from: this.localId,
          to: peerId,
          sdp: pc.localDescription ?? offer,
          generation: peer.generation,
          relay: peer.useRelay,
        });
      } catch (err) {
        peer.negotiationQueued = false;
        console.warn('Não foi possível renegociar a faixa de vídeo:', err);
      } finally {
        peer.makingOffer = false;
        if (peer.negotiationQueued) this.requestRenegotiation(peerId, peer);
      }
    })();
  }

  private clearRecovery(peer: PeerEntry) {
    if (peer.recoveryTimer !== undefined) {
      window.clearTimeout(peer.recoveryTimer);
      peer.recoveryTimer = undefined;
    }
  }

  /**
   * Uma rede lenta ficava em "Conectando" porque os dois lados derrubavam a
   * tentativa um do outro, ou porque a checagem ainda nem tinha terminado.
   * Só quem faz a oferta recria o par. O outro pede. Se houver TURN, a nova
   * tentativa sai só pelo relay.
   */
  private scheduleRecovery(peerId: string, peer: PeerEntry, delayMs: number, replaceTimer = false) {
    if (peer.connection.signalingState === 'closed') return;
    if (peer.recoveryTimer !== undefined) {
      if (!replaceTimer) return;
      window.clearTimeout(peer.recoveryTimer);
      peer.recoveryTimer = undefined;
    }

    peer.recoveryTimer = window.setTimeout(() => {
      peer.recoveryTimer = undefined;
      if (this.peers.get(peerId) !== peer) return;
      const pc = peer.connection;
      if (pc.signalingState === 'closed' || pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return;
      const look = () => voiceRecoveryDecision({
        localIsOfferer: this.localId < peerId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        ageMs: Date.now() - peer.attemptStartedAt,
        attempt: peer.recoveryAttempts,
        hasTurn: hasTurnUrl(this.iceServers),
        disconnectedForMs: peer.disconnectedAt === undefined ? null : Date.now() - peer.disconnectedAt,
      });
      const preliminary = look();
      if (preliminary.action === 'keep') {
        if (preliminary.delayMs > 0) this.scheduleRecovery(peerId, peer, preliminary.delayMs);
        return;
      }
      void this.refreshIceServers().finally(() => {
        if (this.peers.get(peerId) !== peer) return;
        if (peer.connection.connectionState === 'connected' || peer.connection.iceConnectionState === 'connected') return;
        const decision = look();
        if (decision.action === 'keep') {
          if (decision.delayMs > 0) this.scheduleRecovery(peerId, peer, decision.delayMs);
          return;
        }
        peer.recoveryAttempts += 1;
        if (decision.action === 'request') {
          this.send({
            type: 'peer-reset',
            from: this.localId,
            to: peerId,
            generation: peer.generation,
            relay: decision.relay,
            request: true,
          });
          this.onConnectionStateChange(peerId, 'disconnected');
          this.scheduleRecovery(peerId, peer, decision.delayMs);
          return;
        }
        this.resetPeer(peerId, true, decision.relay);
        const current = this.peers.get(peerId);
        if (current) this.scheduleRecovery(peerId, current, decision.delayMs);
      });
    }, delayMs);
  }

  private handlePeerState(peerId: string, peer: PeerEntry) {
    const pc = peer.connection;
    if (this.peers.get(peerId) !== peer || pc.signalingState === 'closed') return;
    const failed = pc.connectionState === 'failed' || pc.iceConnectionState === 'failed';
    const disconnected = pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected';
    if (pc.connectionState === 'connected') {
      peer.recoveryAttempts = 0;
      peer.offerRetryAttempts = 0;
      peer.disconnectedAt = undefined;
      if (peer.disconnectTimer !== undefined) {
        window.clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = undefined;
      }
      this.clearRecovery(peer);
      if (peer.initialCallFallbackTimer !== undefined) {
        window.clearTimeout(peer.initialCallFallbackTimer);
        peer.initialCallFallbackTimer = undefined;
      }
      if (peer.offerRetryTimer !== undefined) {
        window.clearTimeout(peer.offerRetryTimer);
        peer.offerRetryTimer = undefined;
      }
      this.onConnectionStateChange(peerId, 'connected');
      if (this.videoProfileOverride) {
        const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'video');
        if (sender) void this.configureVideoSender(sender, this.profileForCurrentPeerCount(this.videoProfileOverride), peer);
      }
      const voiceSender = peer.audioTransceiver?.sender;
      if (voiceSender) void this.configureVoiceSender(voiceSender);
      return;
    }
    if (failed) {
      if (peer.disconnectTimer !== undefined) {
        window.clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = undefined;
      }
      this.onConnectionStateChange(peerId, 'disconnected');
      this.scheduleRecovery(peerId, peer, 400, true);
      return;
    }
    // Um piscar de `disconnected` é comum no Chrome. Só recria se continuar assim.
    if (disconnected) {
      peer.disconnectedAt ??= Date.now();
      if (peer.disconnectTimer !== undefined) return;
      peer.disconnectTimer = window.setTimeout(() => {
        peer.disconnectTimer = undefined;
        if (this.peers.get(peerId) !== peer) return;
        const state = pc.connectionState;
        const ice = pc.iceConnectionState;
        if (state === 'connected' || ice === 'connected' || ice === 'completed') return;
        if (state !== 'disconnected' && ice !== 'disconnected' && state !== 'failed' && ice !== 'failed') return;
        this.onConnectionStateChange(peerId, 'disconnected');
        this.scheduleRecovery(peerId, peer, 0, true);
      }, 6_000);
      return;
    }
    peer.disconnectedAt = undefined;
    if (peer.disconnectTimer !== undefined) {
      window.clearTimeout(peer.disconnectTimer);
      peer.disconnectTimer = undefined;
    }
    if (pc.connectionState === 'connecting') this.onConnectionStateChange(peerId, 'connecting');
  }

  /** Troca a conexão por uma nova, o mesmo efeito de sair e entrar na chamada. */
  private resetPeer(peerId: string, notify: boolean, relay = false) {
    const existing = this.peers.get(peerId);
    if (existing?.resetting) return;
    const attempts = existing?.recoveryAttempts ?? 0;
    const generation = (existing?.generation ?? 0) + 1;
    const useRelay = relay || existing?.useRelay || false;
    if (notify) this.send({ type: 'peer-reset', from: this.localId, to: peerId, generation, relay: useRelay });
    this.discardConnection(peerId);
    this.onConnectionStateChange(peerId, 'disconnected');
    this.ensurePeerConnection(peerId, { generation, useRelay });
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.resetting = true;
    peer.recoveryAttempts = attempts;
    if (useRelay) this.screenRelayPeers.add(peerId);
    window.setTimeout(() => {
      const current = this.peers.get(peerId);
      if (current) current.resetting = false;
    }, 4_000);
    this.preparePeerConnection(peerId);
    if (this.localId < peerId) {
      void this.callPeer(peerId).catch((error) => {
        console.warn('Não foi possível reabrir a conexão com o participante:', error);
      });
    }
  }

  /** Adota a geração pedida pelo outro lado, sem incrementar de novo. */
  private adoptPeer(peerId: string, generation: number, relay: boolean) {
    const existing = this.peers.get(peerId);
    if (existing?.generation === generation && existing.connection.signalingState !== 'closed') return;
    const attempts = existing?.recoveryAttempts ?? 0;
    this.discardConnection(peerId);
    this.onConnectionStateChange(peerId, 'disconnected');
    this.ensurePeerConnection(peerId, { generation, useRelay: relay });
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.recoveryAttempts = attempts;
    peer.resetting = true;
    if (relay) this.screenRelayPeers.add(peerId);
    window.setTimeout(() => {
      const current = this.peers.get(peerId);
      if (current) current.resetting = false;
    }, 4_000);
    this.preparePeerConnection(peerId);
  }

  private discardConnection(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    this.clearRecovery(entry);
    if (entry.initialCallFallbackTimer !== undefined) window.clearTimeout(entry.initialCallFallbackTimer);
    if (entry.offerRetryTimer !== undefined) window.clearTimeout(entry.offerRetryTimer);
    if (entry.videoArrivalTimer !== undefined) window.clearTimeout(entry.videoArrivalTimer);
    if (entry.disconnectTimer !== undefined) window.clearTimeout(entry.disconnectTimer);
    if (entry.candidateFlushTimer !== undefined) window.clearTimeout(entry.candidateFlushTimer);
    if (entry.retryNegotiation) {
      entry.connection.removeEventListener('signalingstatechange', entry.retryNegotiation);
      entry.connection.removeEventListener('connectionstatechange', entry.retryNegotiation);
    }
    entry.connection.onicecandidate = null;
    entry.connection.ontrack = null;
    entry.connection.onconnectionstatechange = null;
    entry.connection.oniceconnectionstatechange = null;
    entry.connection.close();
    this.peers.delete(peerId);
  }

  private async refreshIceServers() {
    try {
      const response = await fetch('/api/turn-credentials');
      if (!response.ok) return;
      const data = await response.json() as { iceServers?: IceServerConfig[] };
      if (data.iceServers?.length) this.iceServers = data.iceServers;
    } catch {
      // Mantém os servidores já carregados e tenta a rota de novo mesmo assim.
    }
  }

  private scheduleScreenReplay(peerId: string) {
    this.clearScreenReplay(peerId);
    const started = Date.now();
    const arm = (delay: number) => {
      const timer = window.setTimeout(() => {
        if (this.screenReplayTimers.get(peerId) !== timer) return;
        this.screenReplayTimers.delete(peerId);
        const link = this.incomingScreen.get(peerId);
        const age = link ? Date.now() - link.openedAt : Date.now() - started;
        const decision = nextScreenReplay(
          link?.connection.connectionState ?? null,
          age,
          this.hasLiveScreen(peerId),
          this.screenFrameAsks.get(peerId) ?? 0,
        );
        if (decision.kind === 'stop') return;
        if (decision.kind === 'wait') {
          arm(decision.ms);
          return;
        }
        if (!decision.relay) this.screenFrameAsks.set(peerId, (this.screenFrameAsks.get(peerId) ?? 0) + 1);
        this.send({ type: 'screen-replay', from: this.localId, to: peerId, relay: decision.relay });
        arm(decision.relay ? 20_000 : SCREEN_CONNECT_GRACE_MS);
      }, delay);
      this.screenReplayTimers.set(peerId, timer);
    };
    arm(1_000);
  }

  private clearScreenReplay(peerId: string) {
    const timer = this.screenReplayTimers.get(peerId);
    if (timer !== undefined) window.clearTimeout(timer);
    this.screenReplayTimers.delete(peerId);
    this.screenFrameAsks.delete(peerId);
  }

  private hasLiveScreen(peerId: string) {
    const ids = this.remoteScreenByPeer.get(peerId);
    const stream = this.remoteStreams.get(peerId);
    if (!ids?.size || !stream) return false;
    return Array.from(ids).some((id) => {
      const track = stream.getTrackById(id);
      return !!track && track.readyState === 'live' && !track.muted;
    });
  }

  private rtcConfig(relay = false): RTCConfiguration {
    const turn = relayIceServers(this.iceServers);
    const iceServers = relay && turn.length ? turn : this.iceServers;
    return {
      iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: relay && turn.length ? 0 : 4,
      ...(relay && turn.length ? { iceTransportPolicy: 'relay' as const } : {}),
    };
  }

  private armScreenWatch(peerId: string, link: ScreenLink) {
    if (link.watchTimer !== undefined) window.clearTimeout(link.watchTimer);
    link.watchTimer = window.setTimeout(() => {
      link.watchTimer = undefined;
      if (this.outgoingScreen.get(peerId) !== link || !this.screenActive) return;
      const connection = link.connection;
      if (connection.connectionState === 'connected' || connection.iceConnectionState === 'connected' || connection.iceConnectionState === 'completed') return;
      this.screenRelayPeers.add(peerId);
      void this.offerScreen(peerId, true).finally(() => {
        if (this.outgoingScreen.get(peerId) !== link || !this.screenActive) return;
        if (link.connection.connectionState === 'connected' || link.connection.iceConnectionState === 'failed') return;
        this.armScreenWatch(peerId, link);
      });
    }, SCREEN_CONNECT_GRACE_MS + 500);
  }

  private async offerScreen(peerId: string, force = false) {
    const track = this.screenTrack;
    if (!this.screenActive || !track || track.readyState !== 'live') return;

    const audioTrack = this.screenAudioTrack?.readyState === 'live' ? this.screenAudioTrack : null;
    const existing = this.outgoingScreen.get(peerId);
    if (existing) {
      const state = existing.connection.connectionState;
      const senderTrack = existing.connection.getSenders().find((sender) => sender.track?.kind === 'video')?.track;
      const senderAudio = existing.connection.getSenders().find((sender) => sender.track?.kind === 'audio')?.track ?? null;
      const sameTracks = senderTrack === track && senderAudio === audioTrack;
      const age = Date.now() - existing.openedAt;
      if (sameTracks && screenLinkReusable(state, age, true)) {
        if (state === 'connected' && force) void this.nudgeScreenKeyframe(existing);
        return;
      }
    }

    const generation = (existing?.generation ?? 0) + 1;
    const useRelay = this.screenRelayPeers.has(peerId) || this.peers.get(peerId)?.useRelay === true;
    this.closeOutgoingScreen(peerId);

    const pc = new RTCPeerConnection(this.rtcConfig(useRelay));
    const link: ScreenLink = {
      connection: pc,
      pendingCandidates: [],
      generation,
      openedAt: Date.now(),
      localCandidates: [],
      flushedCandidateCount: 0,
      appliedCandidates: new Set(),
    };
    this.outgoingScreen.set(peerId, link);
    // O áudio da tela vai cru, numa conexão só de envio. Misturar essa faixa
    // no microfone passa pelo cancelador de eco da voz e o Chrome some com o
    // som do sistema — principalmente ao apresentar a tela inteira.
    if (audioTrack) {
      pc.addTransceiver(audioTrack, {
        direction: 'sendonly',
        streams: [new MediaStream([audioTrack])],
      });
    }
    const transceiver = pc.addTransceiver(track, {
      direction: 'sendonly',
      streams: [new MediaStream([track])],
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate || this.outgoingScreen.get(peerId) !== link) return;
      this.queueScreenCandidate(peerId, link, 'sharer', event.candidate.toJSON());
    };
    const onScreenState = () => {
      if (this.outgoingScreen.get(peerId) !== link || !this.screenActive) return;
      if (pc.connectionState === 'connected') {
        this.screenSendRetries.delete(peerId);
        void this.configureVideoSender(transceiver.sender, this.profileForScreen());
        return;
      }
      if (pc.connectionState !== 'failed' && pc.iceConnectionState !== 'failed') return;
      const tries = this.screenSendRetries.get(peerId) ?? 0;
      this.screenSendRetries.set(peerId, tries + 1);
      this.screenRelayPeers.add(peerId);
      window.setTimeout(() => {
        if (this.outgoingScreen.get(peerId) !== link || !this.screenActive) return;
        void this.offerScreen(peerId, true);
      }, Math.min(30_000, 1_000 * 2 ** Math.min(tries, 5)));
    };
    pc.onconnectionstatechange = onScreenState;
    pc.oniceconnectionstatechange = onScreenState;
    this.armScreenWatch(peerId, link);

    try {
      const offer = await pc.createOffer();
      if (this.outgoingScreen.get(peerId) !== link) {
        pc.close();
        return;
      }
      await pc.setLocalDescription(offer);
      await this.configureVideoSender(transceiver.sender, this.profileForScreen());
      link.pendingCandidates.push(...this.takeEarlyIce(peerId, 'viewer', generation));
      this.send({
        type: 'screen-offer',
        from: this.localId,
        to: peerId,
        generation,
        sdp: pc.localDescription ?? offer,
      });
    } catch (error) {
      console.warn('Não foi possível abrir a apresentação para um participante:', error);
      if (this.outgoingScreen.get(peerId) === link) this.closeOutgoingScreen(peerId);
    }
  }

  private async acceptScreenOffer(from: string, sdp: RTCSessionDescriptionInit, generation: number) {
    const current = this.incomingScreen.get(from);
    if (current && generation < current.generation) return;
    if (current && current.generation === generation && current.connection.localDescription?.type === 'answer') {
      this.send({
        type: 'screen-answer',
        from: this.localId,
        to: from,
        generation,
        sdp: current.connection.localDescription,
      });
      return;
    }

    this.closeIncomingScreen(from);
    const pc = new RTCPeerConnection(this.rtcConfig(this.peers.get(from)?.useRelay === true));
    const link: ScreenLink = {
      connection: pc,
      pendingCandidates: [],
      generation,
      openedAt: Date.now(),
      localCandidates: [],
      flushedCandidateCount: 0,
      appliedCandidates: new Set(),
    };
    this.incomingScreen.set(from, link);

    pc.ontrack = (event) => {
      if (this.incomingScreen.get(from) !== link) return;
      if (event.track.kind === 'audio') {
        this.onScreenAudioTrack(from, event.track);
        return;
      }
      this.addRemoteTrack(from, event.track, 'screen');
      if (!event.track.muted) this.clearScreenReplay(from);
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate || this.incomingScreen.get(from) !== link) return;
      this.queueScreenCandidate(from, link, 'viewer', event.candidate.toJSON());
    };
    const onIncomingScreenState = () => {
      if (this.incomingScreen.get(from) !== link) return;
      if (pc.connectionState !== 'failed' && pc.iceConnectionState !== 'failed') return;
      this.send({ type: 'screen-replay', from: this.localId, to: from, relay: true });
    };
    pc.onconnectionstatechange = onIncomingScreenState;
    pc.oniceconnectionstatechange = onIncomingScreenState;

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    if (this.incomingScreen.get(from) !== link) return;
    link.pendingCandidates.push(...this.takeEarlyIce(from, 'sharer', generation));
    await this.flushScreenCandidates(link);
    const answer = await pc.createAnswer();
    if (this.incomingScreen.get(from) !== link) return;
    await pc.setLocalDescription(answer);
    this.send({
      type: 'screen-answer',
      from: this.localId,
      to: from,
      generation,
      sdp: pc.localDescription ?? answer,
    });
  }

  private async acceptScreenAnswer(from: string, sdp: RTCSessionDescriptionInit, generation: number) {
    const link = this.outgoingScreen.get(from);
    if (!link || link.generation !== generation) return;
    if (link.connection.signalingState !== 'have-local-offer') return;
    await link.connection.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushScreenCandidates(link);
  }

  private async addScreenIce(from: string, as: 'sharer' | 'viewer', generation: number, candidate: RTCIceCandidateInit) {
    const link = as === 'sharer' ? this.incomingScreen.get(from) : this.outgoingScreen.get(from);
    if (!link || link.generation !== generation) {
      if (!link || link.generation < generation) this.queueEarlyIce(from, as, generation, candidate);
      return;
    }
    const key = candidateKey(candidate);
    if (link.appliedCandidates.has(key)) return;
    link.appliedCandidates.add(key);
    if (!link.connection.remoteDescription) {
      link.pendingCandidates.push(candidate);
      return;
    }
    try {
      await link.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      link.appliedCandidates.delete(key);
      console.warn('Candidato ICE da apresentação ignorado:', error);
    }
  }

  private queueEarlyIce(peerId: string, as: 'sharer' | 'viewer', generation: number, candidate: RTCIceCandidateInit) {
    const key = `${peerId}:${as}`;
    const list = this.earlyScreenIce.get(key) ?? [];
    list.push({ candidate, generation });
    this.earlyScreenIce.set(key, list);
  }

  private takeEarlyIce(peerId: string, as: 'sharer' | 'viewer', generation: number) {
    const key = `${peerId}:${as}`;
    const list = this.earlyScreenIce.get(key) ?? [];
    this.earlyScreenIce.delete(key);
    return list.filter((item) => item.generation === generation).map((item) => item.candidate);
  }

  private async flushScreenCandidates(link: ScreenLink) {
    const pending = link.pendingCandidates.splice(0);
    for (const candidate of pending) {
      try {
        await link.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        link.appliedCandidates.delete(candidateKey(candidate));
        console.warn('Candidato ICE da apresentação ignorado:', error);
      }
    }
  }

  private stopOutgoingScreens() {
    Array.from(this.outgoingScreen.keys()).forEach((peerId) => this.closeOutgoingScreen(peerId));
  }

  private closeOutgoingScreen(peerId: string) {
    const link = this.outgoingScreen.get(peerId);
    if (!link) return;
    if (link.candidateFlushTimer !== undefined) window.clearTimeout(link.candidateFlushTimer);
    if (link.watchTimer !== undefined) window.clearTimeout(link.watchTimer);
    link.connection.onicecandidate = null;
    link.connection.onconnectionstatechange = null;
    link.connection.oniceconnectionstatechange = null;
    link.connection.close();
    this.outgoingScreen.delete(peerId);
  }

  private closeIncomingScreen(peerId: string) {
    const link = this.incomingScreen.get(peerId);
    if (!link) return;
    if (link.candidateFlushTimer !== undefined) window.clearTimeout(link.candidateFlushTimer);
    if (link.watchTimer !== undefined) window.clearTimeout(link.watchTimer);
    link.connection.onicecandidate = null;
    link.connection.ontrack = null;
    link.connection.onconnectionstatechange = null;
    link.connection.oniceconnectionstatechange = null;
    link.connection.close();
    this.incomingScreen.delete(peerId);
    this.onScreenAudioTrack(peerId, null);
  }

  private handleScreenStop(from: string) {
    this.clearScreenReplay(from);
    this.closeIncomingScreen(from);
    this.removeScreenTracks(from);
  }

  private ensureRemoteStream(peerId: string) {
    let stream = this.remoteStreams.get(peerId);
    if (!stream) {
      stream = this.peers.get(peerId)?.remoteStream ?? new MediaStream();
      this.remoteStreams.set(peerId, stream);
    }
    const peer = this.peers.get(peerId);
    if (peer) peer.remoteStream = stream;
    return stream;
  }

  private publishRemote(peerId: string) {
    const stream = this.remoteStreams.get(peerId);
    if (!stream) return;
    const peer = this.peers.get(peerId);
    if (peer) peer.remoteStream = stream;
    this.onTrack(peerId, new MediaStream(stream.getTracks()));
  }

  private addRemoteTrack(peerId: string, track: MediaStreamTrack, source: 'voice' | 'screen') {
    const stream = this.ensureRemoteStream(peerId);

    if (source === 'screen') {
      let ids = this.remoteScreenByPeer.get(peerId);
      if (!ids) {
        ids = new Set();
        this.remoteScreenByPeer.set(peerId, ids);
      }
      ids.forEach((id) => {
        const previous = stream.getTrackById(id);
        if (previous && previous.id !== track.id) stream.removeTrack(previous);
        if (previous?.id !== track.id) this.remoteScreenTrackIds.delete(id);
      });
      ids.clear();
      ids.add(track.id);
      this.remoteScreenTrackIds.add(track.id);
      const voiceVideo = this.voiceVideoByPeer.get(peerId);
      if (voiceVideo && stream.getTrackById(voiceVideo.id)) stream.removeTrack(voiceVideo);
      if (!stream.getTrackById(track.id)) stream.addTrack(track);
      this.attachTrackLifecycle(peerId, track, source);
      this.publishRemote(peerId);
      return;
    }

    if (track.kind === 'video') {
      this.voiceVideoByPeer.set(peerId, track);
      const screenIds = this.remoteScreenByPeer.get(peerId);
      const screenLive = !!screenIds && Array.from(screenIds).some((id) => stream.getTrackById(id)?.readyState === 'live');
      this.attachTrackLifecycle(peerId, track, source);
      if (screenLive) return;
      stream.getVideoTracks().forEach((existing) => {
        if (existing.id !== track.id && !this.remoteScreenTrackIds.has(existing.id)) stream.removeTrack(existing);
      });
      if (!stream.getTrackById(track.id)) stream.addTrack(track);
      this.publishRemote(peerId);
      return;
    }

    const currentVoice = stream.getAudioTracks().find((existing) => existing.readyState === 'live' && !existing.muted);
    if (currentVoice && currentVoice.id !== track.id && track.muted) return;
    stream.getAudioTracks().forEach((existing) => {
      if (existing.id !== track.id) stream.removeTrack(existing);
    });
    if (!stream.getTrackById(track.id)) stream.addTrack(track);
    this.attachTrackLifecycle(peerId, track, source);
    this.watchSpeaking(peerId, stream);
    this.publishRemote(peerId);
  }

  private attachTrackLifecycle(peerId: string, track: MediaStreamTrack, source: 'voice' | 'screen') {
    if (this.watchedRemoteTracks.has(track)) return;
    this.watchedRemoteTracks.add(track);
    const publish = () => {
      if (source === 'screen' && !track.muted && track.readyState === 'live') this.clearScreenReplay(peerId);
      if (track.readyState === 'ended' && source === 'screen') {
        this.removeScreenTracks(peerId);
        return;
      }
      this.publishRemote(peerId);
    };
    track.addEventListener('unmute', publish);
    track.addEventListener('mute', publish);
    track.addEventListener('ended', publish);
  }

  private removeScreenTracks(peerId: string) {
    const stream = this.remoteStreams.get(peerId);
    const ids = this.remoteScreenByPeer.get(peerId);
    if (stream && ids) {
      ids.forEach((id) => {
        const track = stream.getTrackById(id);
        if (track) stream.removeTrack(track);
        this.remoteScreenTrackIds.delete(id);
      });
    }
    this.remoteScreenByPeer.delete(peerId);
    const voiceVideo = this.voiceVideoByPeer.get(peerId);
    if (stream && voiceVideo && voiceVideo.readyState === 'live' && !stream.getTrackById(voiceVideo.id)) {
      stream.addTrack(voiceVideo);
    }
    if (stream) this.publishRemote(peerId);
  }

  private profileForScreen() {
    return this.profileForCurrentPeerCount(this.screenProfile);
  }

  private scheduleOfferRetry(peerId: string, peer: PeerEntry, delayMs: number) {
    if (peer.offerRetryTimer !== undefined || peer.offerRetryAttempts >= 2) return;
    peer.offerRetryTimer = window.setTimeout(() => {
      peer.offerRetryTimer = undefined;
      if (this.peers.get(peerId) !== peer) return;
      const pc = peer.connection;
      if (pc.connectionState === 'connected' || pc.signalingState === 'closed' || pc.remoteDescription) return;
      if (pc.signalingState === 'have-local-offer' && pc.localDescription?.type === 'offer') {
        peer.offerRetryAttempts += 1;
        this.send({
          type: 'offer',
          from: this.localId,
          to: peerId,
          sdp: pc.localDescription,
          generation: peer.generation,
          relay: peer.useRelay,
        });
        this.resendVoiceCandidates(peerId, peer);
        this.scheduleOfferRetry(peerId, peer, 5_000);
      }
    }, delayMs);
  }

  private async flushPendingCandidates(peer: PeerEntry) {
    const pending = peer.pendingCandidates.splice(0);
    for (const candidate of pending) {
      const key = candidateKey(candidate);
      if (peer.appliedCandidates.has(key)) continue;
      peer.appliedCandidates.add(key);
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        peer.appliedCandidates.delete(key);
        console.warn('Candidato ICE ignorado:', err);
      }
    }
  }

  private async handleSignal(payload: SignalPayload) {
    if (payload.type === 'screen-share-state') {
      this.onScreenShareState(payload.from, payload.sharing);
      if (payload.sharing) this.scheduleScreenReplay(payload.from);
      else this.handleScreenStop(payload.from);
      return;
    }
    try {
      if (payload.type === 'screen-offer') {
        await this.acceptScreenOffer(payload.from, payload.sdp, payload.generation);
        return;
      }
      if (payload.type === 'screen-answer') {
        await this.acceptScreenAnswer(payload.from, payload.sdp, payload.generation);
        return;
      }
      if (payload.type === 'screen-ice') {
        await this.addScreenIce(payload.from, payload.as, payload.generation, payload.candidate);
        return;
      }
      if (payload.type === 'screen-ice-bundle') {
        for (const candidate of payload.candidates) {
          await this.addScreenIce(payload.from, payload.as, payload.generation, candidate);
        }
        return;
      }
    } catch (error) {
      console.warn('Erro ao processar a apresentação de tela:', error);
      return;
    }
    if (payload.type === 'screen-stop') {
      this.handleScreenStop(payload.from);
      return;
    }
    if (payload.type === 'screen-replay') {
      if (!this.screenActive) return;
      const existing = this.outgoingScreen.get(payload.from);
      const age = existing ? Date.now() - existing.openedAt : SCREEN_CONNECT_GRACE_MS;
      const response = screenReplayResponse(existing?.connection.connectionState ?? null, age, payload.relay === true);
      if (response === 'ignore') return;
      if (response === 'keyframe' && existing) {
        void this.nudgeScreenKeyframe(existing);
        return;
      }
      if (payload.relay) this.screenRelayPeers.add(payload.from);
      void this.offerScreen(payload.from, true);
      return;
    }
    if (payload.type === 'peer-reset') {
      this.handlePeerReset(payload.from, payload.generation, payload.relay === true, payload.request === true);
      return;
    }
    if (payload.type === 'media-state') {
      this.onMediaState(payload.from, { micOn: payload.micOn, camOn: payload.camOn });
      return;
    }

    const { from } = payload;
    if (payload.type === 'offer') {
      const existing = this.peers.get(from);
      const action = signalGenerationAction(existing?.generation ?? 0, payload.generation);
      if (action === 'ignore') return;
      if (action === 'replace') this.adoptPeer(from, payload.generation ?? 1, payload.relay === true);
      else if (!existing) this.ensurePeerConnection(from, { generation: payload.generation, useRelay: payload.relay === true });
    } else if (payload.type === 'answer') {
      const existing = this.peers.get(from);
      if (!existing || signalGenerationAction(existing.generation, payload.generation) !== 'apply') return;
    } else if (payload.type === 'ice-candidate' || payload.type === 'ice-candidates') {
      const existing = this.peers.get(from);
      const generation = payload.generation;
      const action = signalGenerationAction(existing?.generation ?? 0, generation);
      const list = payload.type === 'ice-candidates' ? payload.candidates : [payload.candidate];
      if (action === 'ignore') return;
      if (action === 'replace' && generation !== undefined) {
        this.queueEarlyVoiceIce(from, generation, list);
        return;
      }
      if (!existing) this.ensurePeerConnection(from);
    }

    const peer = this.peers.get(from);
    const pc = peer?.connection;
    if (!peer || !pc) return;

    if (peer.initialCallFallbackTimer !== undefined) {
      window.clearTimeout(peer.initialCallFallbackTimer);
      peer.initialCallFallbackTimer = undefined;
    }

    try {
      if (payload.type === 'offer') {
        // Se a oferta inicial foi reenviada, devolva a resposta já pronta.
        if (
          pc.signalingState === 'stable' &&
          pc.remoteDescription?.type === 'offer' &&
          pc.remoteDescription.sdp === payload.sdp.sdp &&
          pc.localDescription?.type === 'answer'
        ) {
          this.send({ type: 'answer', from: this.localId, to: from, sdp: pc.localDescription, generation: peer.generation });
          return;
        }
        if (peer.offerRetryTimer !== undefined) {
          window.clearTimeout(peer.offerRetryTimer);
          peer.offerRetryTimer = undefined;
        }
        const readyForOffer = !peer.makingOffer &&
          (pc.signalingState === 'stable' || peer.settingRemoteAnswerPending);
        const offerCollision = !readyForOffer;
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        if (offerCollision) await pc.setLocalDescription({ type: 'rollback' });
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await this.flushPendingCandidates(peer);
        await peer.mediaTracksReady;
        await peer.videoProfileReady;
        await peer.soundboardTrackReady;
        const answer = voiceDescription(await pc.createAnswer());
        await pc.setLocalDescription(answer);
        peer.negotiationQueued = false;
        peer.attemptStartedAt = Date.now();
        this.send({ type: 'answer', from: this.localId, to: from, sdp: pc.localDescription ?? answer, generation: peer.generation });
        this.scheduleRecovery(from, peer, 8_000);
      } else if (payload.type === 'answer') {
        if (peer.offerRetryTimer !== undefined) {
          window.clearTimeout(peer.offerRetryTimer);
          peer.offerRetryTimer = undefined;
        }
        peer.offerRetryAttempts = 0;
        peer.settingRemoteAnswerPending = true;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        peer.settingRemoteAnswerPending = false;
        peer.attemptStartedAt = Date.now();
        await this.flushPendingCandidates(peer);
      } else if (payload.type === 'ice-candidate') {
        await this.addVoiceCandidate(peer, payload.candidate);
      } else if (payload.type === 'ice-candidates') {
        for (const candidate of payload.candidates) await this.addVoiceCandidate(peer, candidate);
      }
    } catch (err) {
      peer.settingRemoteAnswerPending = false;
      // Falhas pontuais de sinalização (ex.: candidato ICE fora de ordem) não devem
      // derrubar a chamada inteira; o navegador tenta se recuperar sozinho.
      console.warn('Erro ao processar sinal WebRTC:', err);
    }
  }

  private handlePeerReset(peerId: string, generation: number | undefined, relay: boolean, request: boolean) {
    if (request) {
      if (this.localId > peerId) return;
      const peer = this.peers.get(peerId);
      if (peer?.resetting) return;
      const failed = peer?.connection.connectionState === 'failed' || peer?.connection.iceConnectionState === 'failed';
      if (peer?.useRelay && !failed && Date.now() - peer.attemptStartedAt < VOICE_CHECKING_GRACE_MS) return;
      void this.refreshIceServers().finally(() => {
        const current = this.peers.get(peerId);
        if (!current || current.resetting) return;
        const stillFailed = current.connection.connectionState === 'failed' || current.connection.iceConnectionState === 'failed';
        if (current.useRelay && !stillFailed && Date.now() - current.attemptStartedAt < VOICE_CHECKING_GRACE_MS) return;
        this.resetPeer(peerId, true, relay || hasTurnUrl(this.iceServers));
      });
      return;
    }
    const current = this.peers.get(peerId);
    if (generation === undefined) {
      this.resetPeer(peerId, false, relay);
      return;
    }
    const action = signalGenerationAction(current?.generation ?? 0, generation);
    if (action === 'ignore') return;
    if (action === 'apply' && current && current.connection.signalingState !== 'closed') return;
    this.adoptPeer(peerId, generation, relay || current?.useRelay === true);
  }

  private queueEarlyVoiceIce(peerId: string, generation: number, candidates: RTCIceCandidateInit[]) {
    const key = `${peerId}:${generation}`;
    const list = this.earlyVoiceIce.get(key) ?? [];
    list.push(...candidates);
    this.earlyVoiceIce.set(key, list);
  }

  private takeEarlyVoiceIce(peerId: string, generation: number) {
    const key = `${peerId}:${generation}`;
    const list = this.earlyVoiceIce.get(key) ?? [];
    this.earlyVoiceIce.delete(key);
    return list;
  }

  private queueVoiceCandidate(peerId: string, peer: PeerEntry, candidate: RTCIceCandidateInit) {
    peer.localCandidates.push(candidate);
    if (peer.candidateFlushTimer !== undefined) return;
    peer.candidateFlushTimer = window.setTimeout(() => {
      peer.candidateFlushTimer = undefined;
      this.flushVoiceCandidates(peerId, peer, false);
    }, 200);
  }

  private resendVoiceCandidates(peerId: string, peer: PeerEntry) {
    if (peer.candidateFlushTimer !== undefined) {
      window.clearTimeout(peer.candidateFlushTimer);
      peer.candidateFlushTimer = undefined;
    }
    this.flushVoiceCandidates(peerId, peer, true);
  }

  private flushVoiceCandidates(peerId: string, peer: PeerEntry, all: boolean) {
    if (this.peers.get(peerId) !== peer) return;
    const fresh = peer.localCandidates.slice(all ? 0 : peer.flushedCandidateCount);
    if (!fresh.length) return;
    peer.flushedCandidateCount = peer.localCandidates.length;
    for (const candidates of chunkCandidates(fresh)) {
      this.send({ type: 'ice-candidates', from: this.localId, to: peerId, generation: peer.generation, candidates });
    }
  }

  private async addVoiceCandidate(peer: PeerEntry, candidate: RTCIceCandidateInit) {
    if (peer.ignoreOffer) return;
    const key = candidateKey(candidate);
    if (peer.appliedCandidates.has(key)) return;
    if (!peer.connection.remoteDescription) {
      if (peer.pendingCandidates.some((item) => candidateKey(item) === key)) return;
      peer.pendingCandidates.push(candidate);
      return;
    }
    peer.appliedCandidates.add(key);
    try {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      peer.appliedCandidates.delete(key);
      console.warn('Candidato ICE ignorado:', err);
    }
  }

  private queueScreenCandidate(peerId: string, link: ScreenLink, as: 'sharer' | 'viewer', candidate: RTCIceCandidateInit) {
    link.localCandidates.push(candidate);
    if (link.candidateFlushTimer !== undefined) return;
    link.candidateFlushTimer = window.setTimeout(() => {
      link.candidateFlushTimer = undefined;
      this.flushScreenCandidateQueue(peerId, link, as);
    }, 200);
  }

  private flushScreenCandidateQueue(peerId: string, link: ScreenLink, as: 'sharer' | 'viewer') {
    const current = as === 'sharer' ? this.outgoingScreen.get(peerId) : this.incomingScreen.get(peerId);
    if (current !== link) return;
    const fresh = link.localCandidates.slice(link.flushedCandidateCount);
    if (!fresh.length) return;
    link.flushedCandidateCount = link.localCandidates.length;
    for (const candidates of chunkCandidates(fresh)) {
      this.send({
        type: 'screen-ice-bundle',
        from: this.localId,
        to: peerId,
        as,
        generation: link.generation,
        candidates,
      });
    }
  }

  private async nudgeScreenKeyframe(link: ScreenLink) {
    const sender = link.connection.getSenders().find((item) => item.track?.kind === 'video');
    if (!sender) return;
    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings.length) return;
      const primary = { ...parameters.encodings[0] };
      parameters.encodings[0] = { ...primary, active: false };
      await sender.setParameters(parameters);
      parameters.encodings[0] = { ...primary, active: true };
      await sender.setParameters(parameters);
    } catch (error) {
      console.warn('Não foi possível renovar o quadro da apresentação:', error);
    }
  }

  private send(payload: SignalPayload) {
    let message: SignalPayload = payload;
    if ('sdp' in payload && payload.sdp) {
      const { sdp, ...envelope } = payload;
      message = { ...payload, sdp: shrinkSessionDescription(sdp, envelope) };
    }
    try {
      const delivered = this.channel.trigger('client-signal', message);
      if (!delivered) console.warn('Não foi possível enviar o sinal da chamada.', message.type);
    } catch (error) {
      console.warn('Não foi possível enviar o sinal da chamada.', error);
    }
  }

  private async configureVoiceSender(sender: RTCRtpSender) {
    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings.length) return;
      const primary = { ...parameters.encodings[0] };
      primary.maxBitrate = 96_000;
      primary.priority = 'high';
      primary.networkPriority = 'high';
      parameters.encodings[0] = primary;
      await sender.setParameters(parameters);
    } catch (error) {
      console.warn('Não foi possível priorizar o microfone:', error);
    }
  }

  private configureVideoSender(
    sender: RTCRtpSender,
    profile: VideoSenderProfile | null,
    peer?: PeerEntry,
    bitrate = profile?.maxBitrate
  ) {
    if (peer) {
      peer.videoSender = sender;
      peer.videoProfile = profile;
    }

    const apply = async () => {
      try {
        const parameters = sender.getParameters();
        if (!parameters.encodings.length) return;

        const primary = { ...parameters.encodings[0] };
        if (profile) {
          // A qualidade escolhida vale desde o primeiro quadro. O navegador
          // ainda reduz sozinho se a rede apertar, sem a escada que deixava
          // a imagem ruim e só melhorava minutos depois.
          primary.maxBitrate = bitrate;
          primary.maxFramerate = profile.maxFramerate;
          primary.priority = 'high';
          primary.networkPriority = 'high';
          const source = sender.track?.getSettings();
          if (source?.width && source.height && profile.width && profile.height) {
            const scale = Math.max(source.width / profile.width, source.height / profile.height, 1);
            if (scale > 1.01) primary.scaleResolutionDownBy = scale;
            else delete primary.scaleResolutionDownBy;
          }
          parameters.degradationPreference = 'maintain-resolution';
        } else {
          delete primary.maxBitrate;
          delete primary.maxFramerate;
          delete primary.scaleResolutionDownBy;
          delete primary.priority;
          delete primary.networkPriority;
          parameters.degradationPreference = 'balanced';
        }
        parameters.encodings[0] = primary;
        await sender.setParameters(parameters);
      } catch (error) {
        console.warn('Não foi possível ajustar o bitrate da apresentação:', error);
      }
    };

    if (!peer) return apply();
    // Serializa atualizações de perfil e as adaptações de rede do mesmo sender.
    const update = peer.videoParametersChain.then(apply);
    peer.videoParametersChain = update.catch(() => {});
    return update;
  }

  private profileForCurrentPeerCount(profile: VideoSenderProfile | null): VideoSenderProfile | null {
    if (!profile?.totalBitrate) return profile;
    const recipientCount = Math.max(1, this.peers.size);
    return { ...profile, maxBitrate: Math.ceil(profile.totalBitrate / recipientCount) };
  }

  private rebalanceVideoSenders() {
    const screenProfile = this.profileForScreen();
    if (screenProfile) {
      for (const link of this.outgoingScreen.values()) {
        const sender = link.connection.getSenders().find((candidate) => candidate.track?.kind === 'video');
        if (sender?.track?.readyState === 'live') void this.configureVideoSender(sender, screenProfile);
      }
    }

    const profile = this.videoProfileOverride;
    if (!profile) return;
    const adjustedProfile = this.profileForCurrentPeerCount(profile);
    for (const peer of this.peers.values()) {
      const sender = peer.connection.getSenders().find((candidate) => candidate.track?.kind === 'video');
      if (sender?.track?.readyState === 'live') {
        void this.configureVideoSender(sender, adjustedProfile, peer);
      }
    }
  }

  private watchSpeaking(id: string, stream: MediaStream) {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    const previousWatcher = this.speakingWatchers.get(id);
    if (previousWatcher) {
      cancelAnimationFrame(previousWatcher.raf);
      previousWatcher.cloned?.stop();
      previousWatcher.ctx.close().catch(() => {});
      this.speakingWatchers.delete(id);
    }
    try {
      const ctx = new AudioContext();
      // A faixa original fica só para o alto-falante. O indicador de fala
      // observa uma cópia, para o navegador não entregar o som ao analisador.
      const cloned = audioTrack.clone();
      const source = ctx.createMediaStreamSource(new MediaStream([cloned]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      void ctx.resume().catch(() => {});
      const data = new Uint8Array(analyser.fftSize);
      const watcher: SpeakingWatcher = { ctx, analyser, raf: 0, cloned };

      let gate = createVoiceGate();
      const tick = () => {
        if (this.speakingWatchers.get(id) !== watcher) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) { const centered = (value - 128) / 128; sum += centered * centered; }
        const rms = Math.sqrt(sum / data.length);
        const next = advanceVoiceGate(gate, rms, performance.now());
        if (next.speaking !== gate.speaking) this.onSpeakingChange(id, next.speaking);
        gate = next;
        watcher.raf = requestAnimationFrame(tick);
      };
      this.speakingWatchers.set(id, watcher);
      watcher.raf = requestAnimationFrame(tick);
    } catch {
      // API de áudio indisponível; indicador de "falando" simplesmente não aparecerá.
    }
  }

  destroy() {
    this.hangupAll();
    this.speakingWatchers.forEach((w) => {
      cancelAnimationFrame(w.raf);
      w.cloned?.stop();
      w.ctx.close().catch(() => {});
    });
    this.speakingWatchers.clear();
  }
}
