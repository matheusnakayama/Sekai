'use client';

import type { Channel } from 'pusher-js';
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

interface SpeakingWatcher {
  ctx: AudioContext;
  analyser: AnalyserNode;
  raf: number;
}

/**
 * Gerencia uma topologia "mesh": cada participante mantém uma RTCPeerConnection
 * direta com todos os demais. É voltada a salas pequenas; o envio de tela
 * replica a faixa para cada destinatário. A sinalização (offer/answer/ICE)
 * trafega pelo canal de presença do Pusher usando eventos "client-*".
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
  private iceServers: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private channel: Channel;
  private localId: string;

  onTrack: TrackHandler = () => {};
  onSoundboardTrack: SoundboardTrackHandler = () => {};
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
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({ type: 'offer', from: this.localId, to: peerId, sdp: pc.localDescription ?? offer });
      this.scheduleOfferRetry(peerId, peer, 5_000);
      this.scheduleRecovery(peerId, peer, 12_000);
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
      if (entry.retryNegotiation) {
        entry.connection.removeEventListener('signalingstatechange', entry.retryNegotiation);
        entry.connection.removeEventListener('connectionstatechange', entry.retryNegotiation);
      }
      // As faixas locais são compartilhadas entre todas as conexões da sala.
      // Fechar uma conexão não pode encerrar o microfone/câmera dos demais pares.
      entry.connection.close();
      this.peers.delete(peerId);
    }
    const watcher = this.speakingWatchers.get(peerId);
    if (watcher) {
      cancelAnimationFrame(watcher.raf);
      watcher.ctx.close().catch(() => {});
      this.speakingWatchers.delete(peerId);
    }

    // Quando alguém sai durante uma apresentação, redistribua o limite de
    // bitrate entre os destinatários que ainda estão conectados. Sem isso,
    // cada sender continua preso ao valor reduzido da sala maior.
    if (entry && this.videoProfileOverride) this.rebalanceVideoSenders();
  }

  hangupAll() {
    this.videoProfileOverride = null;
    Array.from(this.peers.keys()).forEach((id) => this.hangupPeer(id));
  }

  /** Substitui a faixa de vídeo em todas as conexões (usado para câmera <-> compartilhamento de tela). */
  replaceVideoTrack(
    track: MediaStreamTrack | null,
    _stream?: MediaStream | null,
    profile: VideoSenderProfile | null = null
  ) {
    // Trocas rápidas (parar/iniciar a apresentação) precisam chegar aos pares
    // na mesma ordem. Manter o mesmo sender evita renegociações desnecessárias,
    // que eram a causa de a imagem funcionar só em algumas guias.
    const update = this.videoReplaceChain.then(async () => {
      this.hasVideoTrackOverride = true;
      this.videoTrackOverride = track;
      this.videoProfileOverride = profile;

      for (const [peerId, peer] of this.peers) {
        const { connection } = peer;
        if (connection.signalingState === 'closed') continue;
        await peer.mediaTracksReady;
        const transceiver = peer.videoTransceiver ?? connection.getTransceivers().find((candidate) => candidate.receiver.track.kind === 'video');
        if (!transceiver) continue;
        peer.videoTransceiver = transceiver;
        if (track && (transceiver.direction === 'inactive' || transceiver.direction === 'recvonly')) {
          transceiver.direction = 'sendrecv';
        }
        await transceiver.sender.replaceTrack(track);
        await this.configureVideoSender(transceiver.sender, this.profileForCurrentPeerCount(profile), peer);
        // Quem já estava na sala negociou a faixa de vídeo vazia. Sem uma nova
        // oferta, o replaceTrack fica mudo para esse participante até ele sair
        // e entrar de novo.
        this.requestRenegotiation(peerId, peer);
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

  private ensurePeerConnection(peerId: string): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing.connection;

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 4,
    });
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
      videoParametersChain: Promise.resolve(),
    };
    this.peers.set(peerId, peer);

    const localTracks = this.localStream?.getTracks() ?? [];
    const localAudioTrack = localTracks.find((track) => track.kind === 'audio') ?? null;
    const localVideoTrack = localTracks.find((track) => track.kind === 'video') ?? null;
    const audioTrack = this.hasAudioTrackOverride ? this.audioTrackOverride : localAudioTrack;
    const videoTrack = this.hasVideoTrackOverride ? this.videoTrackOverride : localVideoTrack;
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
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          from: this.localId,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.transceiver === peer.soundboardTransceiver) {
        this.onSoundboardTrack(peerId, event.track);
        return;
      }
      // Mantenha uma MediaStream estável por participante. Além de cobrir
      // transceivers streamless, isso evita perder a imagem quando o navegador
      // muda a associação da faixa entre câmera e tela durante renegociação.
      const stream = peer.remoteStream ?? new MediaStream();
      const previousTrack = stream.getTracks().find(
        (track) => track.kind === event.track.kind && track.id !== event.track.id
      );
      if (previousTrack) stream.removeTrack(previousTrack);
      if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      peer.remoteStream = stream;
      const publish = () => this.onTrack(peerId, new MediaStream(stream.getTracks()));
      publish();
      event.track.addEventListener('unmute', publish);
      event.track.addEventListener('mute', publish);
      event.track.addEventListener('ended', publish);
      this.watchSpeaking(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        peer.recoveryAttempts = 0;
        peer.offerRetryAttempts = 0;
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
        return;
      }
      if (pc.connectionState === 'failed') {
        this.onConnectionStateChange(peerId, 'connecting');
        this.scheduleRecovery(peerId, peer, 800, true);
        return;
      }
      if (pc.connectionState === 'disconnected') {
        this.onConnectionStateChange(peerId, 'disconnected');
        this.scheduleRecovery(peerId, peer, 4_000, true);
        return;
      }
      this.onConnectionStateChange(peerId, pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        this.onConnectionStateChange(peerId, 'connecting');
        this.scheduleRecovery(peerId, peer, 800, true);
      }
    };

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
        const offer = await pc.createOffer(restartingIce ? { iceRestart: true } : undefined);
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
   * Se a rota não fecha, recria o par em vez de desistir. O aviso antigo
   * marcava a chamada como falha permanente depois de duas tentativas.
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
      if (pc.signalingState === 'closed' || pc.connectionState === 'connected') return;
      // O id menor age primeiro. Se ele não resolver, o outro lado assume.
      if (this.localId > peerId && peer.recoveryAttempts < 1) {
        peer.recoveryAttempts += 1;
        this.scheduleRecovery(peerId, peer, 6_000);
        return;
      }
      peer.recoveryAttempts += 1;
      const wait = Math.min(12_000, 1_500 * peer.recoveryAttempts);
      void this.refreshIceServers().finally(() => {
        if (this.peers.get(peerId) !== peer) return;
        if (peer.connection.connectionState === 'connected') return;
        this.resetPeer(peerId, true);
        const current = this.peers.get(peerId);
        if (current) this.scheduleRecovery(peerId, current, wait);
      });
    }, delayMs);
  }

  /** Troca a conexão por uma nova, o mesmo efeito de sair e entrar na chamada. */
  private resetPeer(peerId: string, notify: boolean) {
    const existing = this.peers.get(peerId);
    if (existing?.resetting) return;
    const attempts = existing?.recoveryAttempts ?? 0;
    if (notify) this.send({ type: 'peer-reset', from: this.localId, to: peerId });
    this.discardConnection(peerId);
    this.onConnectionStateChange(peerId, 'connecting');
    this.ensurePeerConnection(peerId);
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.resetting = true;
    peer.recoveryAttempts = attempts;
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

  private discardConnection(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    this.clearRecovery(entry);
    if (entry.initialCallFallbackTimer !== undefined) window.clearTimeout(entry.initialCallFallbackTimer);
    if (entry.offerRetryTimer !== undefined) window.clearTimeout(entry.offerRetryTimer);
    if (entry.videoArrivalTimer !== undefined) window.clearTimeout(entry.videoArrivalTimer);
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

  private ensureRemoteVideoArrives(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.videoArrivalTimer !== undefined) window.clearTimeout(peer.videoArrivalTimer);
    peer.videoArrivalTimer = window.setTimeout(() => {
      const current = this.peers.get(peerId);
      if (!current || current.videoArrivalTimer === undefined) return;
      current.videoArrivalTimer = undefined;
      if (current.connection.connectionState !== 'connected') return;
      const liveVideo = current.remoteStream?.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted);
      if (liveVideo) return;
      this.resetPeer(peerId, true);
    }, 5_000);
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
        this.send({ type: 'offer', from: this.localId, to: peerId, sdp: pc.localDescription });
        this.scheduleOfferRetry(peerId, peer, 5_000);
      }
    }, delayMs);
  }

  private async flushPendingCandidates(peer: PeerEntry) {
    const pending = peer.pendingCandidates.splice(0);
    for (const candidate of pending) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Candidato ICE ignorado:', err);
      }
    }
  }

  private async handleSignal(payload: SignalPayload) {
    if (payload.type === 'screen-share-state') {
      this.onScreenShareState(payload.from, payload.sharing);
      if (payload.sharing) this.ensureRemoteVideoArrives(payload.from);
      return;
    }
    if (payload.type === 'peer-reset') {
      this.resetPeer(payload.from, false);
      return;
    }
    if (payload.type === 'media-state') {
      this.onMediaState(payload.from, { micOn: payload.micOn, camOn: payload.camOn });
      return;
    }

    const { from } = payload;
    const pc = this.ensurePeerConnection(from);
    const peer = this.peers.get(from);
    if (!peer) return;

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
          this.send({ type: 'answer', from: this.localId, to: from, sdp: pc.localDescription });
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
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        peer.negotiationQueued = false;
        this.send({ type: 'answer', from: this.localId, to: from, sdp: pc.localDescription ?? answer });
      } else if (payload.type === 'answer') {
        if (peer.offerRetryTimer !== undefined) {
          window.clearTimeout(peer.offerRetryTimer);
          peer.offerRetryTimer = undefined;
        }
        peer.offerRetryAttempts = 0;
        peer.settingRemoteAnswerPending = true;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        peer.settingRemoteAnswerPending = false;
        await this.flushPendingCandidates(peer);
      } else if (payload.type === 'ice-candidate') {
        if (!peer.ignoreOffer) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            peer.pendingCandidates.push(payload.candidate);
          }
        }
      }
    } catch (err) {
      peer.settingRemoteAnswerPending = false;
      // Falhas pontuais de sinalização (ex.: candidato ICE fora de ordem) não devem
      // derrubar a chamada inteira; o navegador tenta se recuperar sozinho.
      console.warn('Erro ao processar sinal WebRTC:', err);
    }
  }

  private send(payload: SignalPayload) {
    this.channel.trigger('client-signal', payload);
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
      previousWatcher.ctx.close().catch(() => {});
      this.speakingWatchers.delete(id);
    }
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      void ctx.resume().catch(() => {});
      const data = new Uint8Array(analyser.fftSize);
      const watcher: SpeakingWatcher = { ctx, analyser, raf: 0 };

      let speaking = false;
      let aboveThresholdSince: number | null = null;
      let belowThresholdSince: number | null = null;
      let noiseFloor = 0.006;
      const tick = () => {
        if (this.speakingWatchers.get(id) !== watcher) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) { const centered = (value - 128) / 128; sum += centered * centered; }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        const startThreshold = Math.min(0.05, Math.max(0.014, noiseFloor * 2.8));
        const stopThreshold = Math.min(0.035, Math.max(0.009, noiseFloor * 1.65));
        if (!speaking) noiseFloor = noiseFloor * 0.985 + Math.min(rms, 0.04) * 0.015;
        if (!speaking && rms >= startThreshold) { aboveThresholdSince ??= now; belowThresholdSince = null; }
        else if (speaking && rms < stopThreshold) { belowThresholdSince ??= now; aboveThresholdSince = null; }
        else { aboveThresholdSince = null; belowThresholdSince = null; }
        const nowSpeaking = speaking
          ? !(belowThresholdSince !== null && now - belowThresholdSince > 420)
          : aboveThresholdSince !== null && now - aboveThresholdSince > 130;
        if (nowSpeaking !== speaking) {
          speaking = nowSpeaking;
          this.onSpeakingChange(id, speaking);
        }
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
      w.ctx.close().catch(() => {});
    });
    this.speakingWatchers.clear();
  }
}
