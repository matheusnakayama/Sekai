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
  restartAttempts: number;
  restartTimer?: number;
  initialCallFallbackTimer?: number;
  offerRetryTimer?: number;
  offerRetryAttempts: number;
  videoProfileReady?: Promise<void>;
  mediaTracksReady?: Promise<void>;
  audioTransceiver?: RTCRtpTransceiver;
  videoTransceiver?: RTCRtpTransceiver;
  videoSender?: RTCRtpSender;
  soundboardTransceiver?: RTCRtpTransceiver;
  soundboardTrackReady?: Promise<void>;
  videoProfile?: VideoSenderProfile | null;
  targetVideoBitrate?: number;
  currentVideoBitrate?: number;
  videoBitrateTimer?: number;
  readingVideoStats?: boolean;
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
      await peer.videoProfileReady;
      await peer.mediaTracksReady;
      await peer.soundboardTrackReady;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({ type: 'offer', from: this.localId, to: peerId, sdp: pc.localDescription ?? offer });
      this.scheduleOfferRetry(peerId, peer, 5_000);
      this.scheduleIceRestart(peerId, peer, 15_000);
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
      if (entry.restartTimer !== undefined) window.clearTimeout(entry.restartTimer);
      if (entry.initialCallFallbackTimer !== undefined) window.clearTimeout(entry.initialCallFallbackTimer);
      if (entry.offerRetryTimer !== undefined) window.clearTimeout(entry.offerRetryTimer);
      if (entry.videoBitrateTimer !== undefined) window.clearInterval(entry.videoBitrateTimer);
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

      for (const peer of this.peers.values()) {
        const { connection } = peer;
        if (connection.signalingState === 'closed') continue;
        await peer.mediaTracksReady;
        const transceiver = peer.videoTransceiver ?? connection.getTransceivers().find((candidate) => candidate.receiver.track.kind === 'video');
        if (!transceiver) continue;
        peer.videoTransceiver = transceiver;
        await transceiver.sender.replaceTrack(track);
        await this.configureVideoSender(transceiver.sender, this.profileForCurrentPeerCount(profile), peer);
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

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
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
      restartAttempts: 0,
      offerRetryAttempts: 0,
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
      this.onTrack(peerId, stream);
      this.watchSpeaking(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionStateChange(peerId, pc.connectionState);
      if (pc.connectionState === 'connected') {
        peer.restartAttempts = 0;
        peer.offerRetryAttempts = 0;
        if (peer.restartTimer !== undefined) {
          window.clearTimeout(peer.restartTimer);
          peer.restartTimer = undefined;
        }
        if (peer.initialCallFallbackTimer !== undefined) {
          window.clearTimeout(peer.initialCallFallbackTimer);
          peer.initialCallFallbackTimer = undefined;
        }
        if (peer.offerRetryTimer !== undefined) {
          window.clearTimeout(peer.offerRetryTimer);
          peer.offerRetryTimer = undefined;
        }
      }
      if (pc.connectionState === 'connected' && this.videoProfileOverride) {
        const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'video');
        if (sender) void this.configureVideoSender(sender, this.profileForCurrentPeerCount(this.videoProfileOverride), peer);
      }
      if (pc.connectionState === 'failed') {
        this.scheduleIceRestart(peerId, peer, 800, true);
      } else if (pc.connectionState === 'disconnected') {
        // A breve queda de rede costuma se resolver sozinha; aguarde um pouco.
        this.scheduleIceRestart(peerId, peer, 4_000, true);
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

  /**
   * Em uma sala mesh, cada par tem sua própria rota de rede. O participante
   * com o menor ID é o único que reinicia ICE, evitando ofertas simultâneas.
   */
  private scheduleIceRestart(peerId: string, peer: PeerEntry, delayMs: number, replaceTimer = false) {
    if (this.localId > peerId || peer.connection.signalingState === 'closed') return;
    if (peer.restartTimer !== undefined) {
      if (!replaceTimer) return;
      window.clearTimeout(peer.restartTimer);
      peer.restartTimer = undefined;
    }

    peer.restartTimer = window.setTimeout(() => {
      peer.restartTimer = undefined;
      if (this.peers.get(peerId) !== peer) return;
      const pc = peer.connection;
      if (pc.signalingState === 'closed' || pc.connectionState === 'connected') return;
      if (peer.restartAttempts >= 2) {
        this.onConnectionStateChange(peerId, 'failed');
        return;
      }

      peer.restartAttempts += 1;
      try {
        pc.restartIce();
        peer.iceRestartQueued = true;
        this.requestRenegotiation(peerId, peer);
      } catch (error) {
        console.warn('Não foi possível reiniciar a conexão com o participante:', error);
      }
      this.scheduleIceRestart(peerId, peer, 10_000);
    }, delayMs);
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
      peer.targetVideoBitrate = profile?.maxBitrate;
      peer.currentVideoBitrate = profile?.maxBitrate;
      if (profile) this.startVideoBitrateMonitor(peer);
      else if (peer.videoBitrateTimer !== undefined) {
        window.clearInterval(peer.videoBitrateTimer);
        peer.videoBitrateTimer = undefined;
      }
    }

    const apply = async () => {
      try {
        const parameters = sender.getParameters();
        if (!parameters.encodings.length) return;

        const primary = { ...parameters.encodings[0] };
        if (profile) {
          primary.maxBitrate = bitrate;
          primary.maxFramerate = profile.maxFramerate;
          const source = sender.track?.getSettings();
          if (source?.width && source.height && profile.width && profile.height) {
            // Alguns navegadores capturam a tela na resolução nativa mesmo
            // quando applyConstraints não consegue reduzi-la. Limite também
            // a resolução codificada no sender para respeitar a opção escolhida.
            const scale = Math.max(source.width / profile.width, source.height / profile.height, 1);
            if (scale > 1.01) primary.scaleResolutionDownBy = scale;
            else delete primary.scaleResolutionDownBy;
          }
          // Sob congestionamento, prioriza manter os quadros fluidos e reduz
          // a resolução antes de deixar a apresentação engasgar.
          parameters.degradationPreference = 'maintain-framerate';
        } else {
          delete primary.maxBitrate;
          delete primary.maxFramerate;
          delete primary.scaleResolutionDownBy;
          parameters.degradationPreference = 'balanced';
        }
        parameters.encodings[0] = primary;
        await sender.setParameters(parameters);
      } catch (error) {
        // A captura ainda é enviada se o navegador não permitir definir bitrate.
        console.warn('Não foi possível ajustar o bitrate da apresentação:', error);
      }
    };

    if (!peer) return apply();
    // Serializa atualizações de perfil e as adaptações de rede do mesmo sender.
    const update = peer.videoParametersChain.then(apply);
    peer.videoParametersChain = update.catch(() => {});
    return update;
  }

  private startVideoBitrateMonitor(peer: PeerEntry) {
    if (peer.videoBitrateTimer !== undefined) return;
    peer.videoBitrateTimer = window.setInterval(() => {
      void this.adaptVideoBitrate(peer);
    }, 2_500);
  }

  private async adaptVideoBitrate(peer: PeerEntry) {
    const { connection, videoSender, videoProfile, targetVideoBitrate } = peer;
    if (
      peer.readingVideoStats || !videoSender || !videoProfile || !targetVideoBitrate ||
      connection.connectionState !== 'connected' || videoSender.track?.readyState !== 'live'
    ) return;

    peer.readingVideoStats = true;
    try {
      const report = await videoSender.getStats();
      // A pessoa pode ter parado ou reiniciado a apresentação enquanto as
      // estatísticas eram consultadas; não aplique um perfil antigo à câmera.
      if (peer.videoProfile !== videoProfile || peer.videoSender !== videoSender) return;
      type OutgoingNetworkStat = RTCStats & {
        availableOutgoingBitrate?: number;
        selectedCandidatePairId?: string;
        selected?: boolean;
        nominated?: boolean;
        writable?: boolean;
        state?: string;
      };
      const stats = Array.from(report.values()) as OutgoingNetworkStat[];
      const transport = stats.find((stat) => stat.type === 'transport' && stat.selectedCandidatePairId);
      const pair = (transport?.selectedCandidatePairId
        ? report.get(transport.selectedCandidatePairId) as OutgoingNetworkStat | undefined
        : undefined) ?? stats.find((stat) => stat.type === 'candidate-pair' && stat.selected)
        ?? stats.find((stat) => stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated && stat.writable);
      const availableBitrate = pair?.availableOutgoingBitrate;
      if (!availableBitrate || !Number.isFinite(availableBitrate)) return;

      // Reserve margem para áudio, sinalização e variações rápidas da rede.
      const networkLimit = Math.max(150_000, Math.floor(availableBitrate * 0.78));
      const desiredBitrate = Math.min(targetVideoBitrate, networkLimit);
      const currentBitrate = peer.currentVideoBitrate ?? targetVideoBitrate;
      // Diminui rápido quando há congestionamento e recupera aos poucos para
      // evitar oscilações visíveis de qualidade.
      const nextBitrate = desiredBitrate < currentBitrate
        ? desiredBitrate
        : Math.min(desiredBitrate, Math.ceil(currentBitrate * 1.3));
      if (Math.abs(nextBitrate - currentBitrate) < Math.max(50_000, currentBitrate * 0.1)) return;

      await this.configureVideoSender(videoSender, videoProfile, peer, nextBitrate);
      peer.currentVideoBitrate = nextBitrate;
    } catch {
      // Alguns navegadores não expõem a estimativa de banda; o controle de
      // congestionamento interno do WebRTC continua ativo nesses casos.
    } finally {
      peer.readingVideoStats = false;
    }
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
