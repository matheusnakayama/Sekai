'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { Participant } from '@/lib/types';
import { CallUserMenu } from '@/components/CallUserMenu';
import { useCallUserMix, writeCallUserMix } from '@/lib/callUserMix';
import { applyRemoteVoiceGain } from '@/lib/remoteCallGain';
import { MicIcon, ScreenShareIcon, VolumeIcon } from './icons';

export default function VideoTile({
  participant,
  muteRemoteAudio = false,
  outputDeviceId = '',
  masterOutputVolume = 1,
  soundEffectsMuted = false,
  focused = false,
  screenShareRevealed = false,
  onRevealScreenShare,
  onFocusParticipant,
  onToggleFullscreen,
  fullscreenActive = false,
  onToggleSoundEffects,
  onMessageUser,
  onOpenProfile,
}: {
  participant: Participant;
  muteRemoteAudio?: boolean;
  outputDeviceId?: string;
  masterOutputVolume?: number;
  soundEffectsMuted?: boolean;
  focused?: boolean;
  screenShareRevealed?: boolean;
  onRevealScreenShare: (participantId: string) => void;
  onFocusParticipant?: () => void;
  onToggleFullscreen?: () => void;
  fullscreenActive?: boolean;
  onToggleSoundEffects?: () => void;
  onMessageUser?: () => void;
  onOpenProfile?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const voiceAudioRef = useRef<HTMLAudioElement>(null);
  const soundboardAudioRef = useRef<HTMLAudioElement>(null);
  const screenAudioRef = useRef<HTMLAudioElement>(null);
  const voiceTrackKey = (participant.stream?.getAudioTracks() ?? []).map((track) => track.id).join(',');
  const videoTrackKey = (participant.stream?.getVideoTracks() ?? []).map((track) => track.id).join(',');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const mix = useCallUserMix(participant.id);
  const volume = mix.muted ? 0 : mix.volume;
  const [showVolume, setShowVolume] = useState(false);
  const [userMenu, setUserMenu] = useState<{ x: number; y: number } | null>(null);
  const [screenVolume, setScreenVolume] = useState(1);
  const [showScreenVolume, setShowScreenVolume] = useState(false);
  const [videoLive, setVideoLive] = useState(false);
  const [screenShareSnapshot, setScreenShareSnapshot] = useState<{ trackKey: string; dataUrl: string } | null>(null);
  const showVideo = !mix.videoHidden && (participant.camOn || participant.isSharingScreen) && videoLive;
  const isScreenSharePreview = participant.isSharingScreen && !participant.isLocal && !screenShareRevealed;

  const playAudioElement = useCallback(async (audio: HTMLAudioElement) => {
    const sinkAudio = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void>; sinkId?: string };
    const needsSinkChange = outputDeviceId
      ? sinkAudio.sinkId !== outputDeviceId
      : Boolean(sinkAudio.sinkId && sinkAudio.sinkId !== 'default');
    if (typeof sinkAudio.setSinkId === 'function' && needsSinkChange) {
      try {
        await sinkAudio.setSinkId(outputDeviceId || 'default');
      } catch (error) {
        // A falha ao escolher uma saída específica não deve silenciar a padrão.
        console.warn('Não foi possível selecionar a saída de áudio:', error);
      }
    }
    await audio.play();
  }, [outputDeviceId]);

  useEffect(() => {
    const video = videoRef.current;
    const tracks = participant.stream?.getVideoTracks() ?? [];
    const update = () => {
      const trackLive = tracks.some((track) => track.readyState === 'live' && !track.muted);
      const hasFrames = (video?.videoWidth ?? 0) > 0;
      setVideoLive(trackLive || hasFrames);
    };
    update();
    tracks.forEach((track) => {
      track.addEventListener('unmute', update);
      track.addEventListener('mute', update);
      track.addEventListener('ended', update);
    });
    video?.addEventListener('resize', update);
    video?.addEventListener('loadeddata', update);
    video?.addEventListener('playing', update);
    return () => {
      tracks.forEach((track) => {
        track.removeEventListener('unmute', update);
        track.removeEventListener('mute', update);
        track.removeEventListener('ended', update);
      });
      video?.removeEventListener('resize', update);
      video?.removeEventListener('loadeddata', update);
      video?.removeEventListener('playing', update);
    };
  }, [participant.stream]);

  useEffect(() => {
    setScreenShareSnapshot(null);
  }, [videoTrackKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // A faixa de voz não pode ir para este vídeo: ele fica mudo para não
    // reproduzir o próprio microfone, e o Chrome entrega o alto-falante ao
    // primeiro elemento que toca a faixa. Se for o vídeo mudo, o amigo some.
    const videoTracks = (participant.stream?.getVideoTracks() ?? []).filter((track) => track.readyState !== 'ended');
    const current = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks() : [];
    const sameTracks = current.length === videoTracks.length && current.every((track, index) => track === videoTracks[index]);
    if (!sameTracks) video.srcObject = videoTracks.length ? new MediaStream(videoTracks) : null;
    video.muted = true;
    if (!videoTracks.length) return;
    if (isScreenSharePreview) {
      let captured = false;
      const freezeFirstFrame = () => {
        if (captured || video.videoWidth <= 0 || video.videoHeight <= 0) return;
        captured = true;
        const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          setScreenShareSnapshot({ trackKey: videoTrackKey, dataUrl: canvas.toDataURL('image/jpeg', 0.76) });
        }
        video.pause();
      };
      video.addEventListener('loadeddata', freezeFirstFrame);
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) freezeFirstFrame();
      else void video.play().catch(() => {});
      return () => video.removeEventListener('loadeddata', freezeFirstFrame);
    }
    void video.play().catch(() => {
      if (!participant.isLocal && (participant.camOn || participant.isSharingScreen)) setPlaybackBlocked(true);
    });
  }, [isScreenSharePreview, participant.camOn, participant.isLocal, participant.isSharingScreen, participant.stream, videoTrackKey]);

  useEffect(() => {
    const retryPlayback = () => {
      const audios = [voiceAudioRef.current, soundboardAudioRef.current, screenAudioRef.current];
      for (const audio of audios) {
        if (!audio?.srcObject || audio.muted) continue;
        void playAudioElement(audio).then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
      }
    };
    window.addEventListener('pointerdown', retryPlayback);
    window.addEventListener('keydown', retryPlayback);
    return () => {
      window.removeEventListener('pointerdown', retryPlayback);
      window.removeEventListener('keydown', retryPlayback);
    };
  }, [outputDeviceId, playAudioElement]);

  useEffect(() => {
    const audio = voiceAudioRef.current;
    if (!audio) return;
    const tracks = (participant.stream?.getAudioTracks() ?? []).filter((track) => track.readyState !== 'ended');
    audio.muted = participant.isLocal || muteRemoteAudio || tracks.length === 0;
    if (!tracks.length || participant.isLocal) {
      audio.srcObject = null;
      return;
    }

    audio.srcObject = new MediaStream(tracks);
    const start = () => {
      if (audio.muted) return;
      void playAudioElement(audio).then(() => setPlaybackBlocked(false)).catch(() => {
        if (!audio.muted) setPlaybackBlocked(true);
      });
    };
    start();
    tracks.forEach((track) => track.addEventListener('unmute', start));
    return () => {
      tracks.forEach((track) => track.removeEventListener('unmute', start));
      audio.pause();
      audio.srcObject = null;
    };
  }, [muteRemoteAudio, outputDeviceId, participant.isLocal, participant.stream, playAudioElement, voiceTrackKey]);

  useEffect(() => {
    const audio = voiceAudioRef.current;
    if (!audio) return;
    const level = Math.max(0, Math.min(2, volume * masterOutputVolume));
    if (participant.isLocal || muteRemoteAudio || level === 0) audio.muted = true;
    else if (audio.srcObject) audio.muted = false;
    void applyRemoteVoiceGain(audio, audio.muted ? 0 : level, outputDeviceId);
  }, [masterOutputVolume, muteRemoteAudio, outputDeviceId, participant.isLocal, volume]);

  useEffect(() => {
    const audio = soundboardAudioRef.current;
    if (!audio) return;
    const level = Math.max(0, Math.min(2, volume * masterOutputVolume));
    audio.muted = participant.isLocal || level === 0 || muteRemoteAudio || soundEffectsMuted;
    void applyRemoteVoiceGain(audio, audio.muted ? 0 : level, outputDeviceId);
    if (!participant.soundboardTrack) {
      audio.srcObject = null;
      return;
    }

    audio.srcObject = new MediaStream([participant.soundboardTrack]);
    if (!audio.muted) void playAudioElement(audio).then(() => setPlaybackBlocked(false)).catch(() => {
      if (!participant.isLocal && !muteRemoteAudio && !soundEffectsMuted) setPlaybackBlocked(true);
    });
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [masterOutputVolume, muteRemoteAudio, outputDeviceId, participant.isLocal, participant.soundboardTrack, playAudioElement, soundEffectsMuted, volume]);

  useEffect(() => {
    const audio = screenAudioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, screenVolume * masterOutputVolume));
    audio.muted = participant.isLocal || screenVolume === 0 || muteRemoteAudio || (!participant.isLocal && !screenShareRevealed);
    if (!participant.screenAudioTrack) {
      audio.srcObject = null;
      return;
    }

    audio.srcObject = new MediaStream([participant.screenAudioTrack]);
    if (!audio.muted) void playAudioElement(audio).then(() => setPlaybackBlocked(false)).catch(() => {
      if (!participant.isLocal && !muteRemoteAudio) setPlaybackBlocked(true);
    });
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [masterOutputVolume, muteRemoteAudio, outputDeviceId, participant.isLocal, participant.screenAudioTrack, playAudioElement, screenShareRevealed, screenVolume]);

  async function enablePlayback() {
    const video = videoRef.current;
    if (video?.srcObject && !isScreenSharePreview) void video.play().catch(() => undefined);

    const audioElements = [voiceAudioRef.current, soundboardAudioRef.current, screenAudioRef.current]
      .filter((audio): audio is HTMLAudioElement => Boolean(audio?.srcObject && !audio.muted));
    const results = await Promise.allSettled(audioElements.map((audio) => playAudioElement(audio)));
    setPlaybackBlocked(results.some((result) => result.status === 'rejected'));
  }

  return (
    <div
      onContextMenu={(event) => {
        if (participant.isLocal) return;
        event.preventDefault();
        event.stopPropagation();
        setUserMenu({ x: event.clientX, y: event.clientY });
      }}
      className={focused
        ? `relative h-full min-h-0 w-full overflow-hidden rounded-2xl border bg-surface-card transition-shadow ${
            participant.isSpeaking ? 'voice-speaking-tile' : 'border-surface-border'
          }`
        : `relative rounded-xl overflow-hidden bg-surface-card border transition-shadow ${
            participant.isSpeaking ? 'voice-speaking-tile' : 'border-surface-border'
          }`}
    >
      <div className={`relative h-full w-full bg-gradient-to-br from-surface-card to-surface ${focused ? 'min-h-0' : 'aspect-video'}`}>
        {participant.stream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 h-full w-full ${participant.isSharingScreen ? 'object-contain' : 'object-cover'} ${showVideo && !isScreenSharePreview ? '' : 'invisible'} ${participant.isLocal && !participant.isSharingScreen ? 'scale-x-[-1]' : ''}`}
          />
        )}
        {isScreenSharePreview && screenShareSnapshot?.trackKey === videoTrackKey && (
          // A prévia mostra um único quadro capturado; o vídeo fica pausado até a pessoa escolher assistir.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={screenShareSnapshot.dataUrl} alt={`Primeiro quadro da apresentação de ${participant.name}`} className="absolute inset-0 h-full w-full object-contain" />
        )}
        <audio ref={voiceAudioRef} autoPlay playsInline className="pointer-events-none absolute h-px w-px opacity-0" />
        <audio ref={soundboardAudioRef} autoPlay playsInline className="pointer-events-none absolute h-px w-px opacity-0" />
        <audio ref={screenAudioRef} autoPlay playsInline className="pointer-events-none absolute h-px w-px opacity-0" />
        {!showVideo && !isScreenSharePreview && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (participant.isLocal) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                setUserMenu({ x: bounds.left, y: bounds.bottom + 8 });
              }}
              onContextMenu={(event) => {
                if (participant.isLocal) return;
                event.preventDefault();
                event.stopPropagation();
                setUserMenu({ x: event.clientX, y: event.clientY });
              }}
              aria-label={`Abrir opções de ${participant.name}`}
              className="relative z-[6] rounded-full"
            >
              <Avatar name={participant.name} avatarUrl={participant.avatarUrl} isSpeaking={participant.isSpeaking} />
            </button>
          </div>
        )}
      </div>

      {onFocusParticipant && (
        <button
          type="button"
          onClick={onFocusParticipant}
          aria-label={focused ? `Voltar à grade de participantes` : `Destacar ${participant.name}`}
          aria-pressed={focused}
          className="absolute inset-0 z-[5] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/80"
        />
      )}

      {isScreenSharePreview && (
        <div className="absolute inset-0 z-[6] flex items-center justify-center bg-black/5 px-3" role="group" aria-label={`Prévia da apresentação de ${participant.name}`}>
          <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-white/15 bg-black/65 px-3 py-3 text-center text-white shadow-2xl backdrop-blur-sm sm:flex-row sm:gap-3 sm:text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-theme-gradient text-white shadow-lg">
              <ScreenShareIcon active />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{participant.name} começou a apresentar</p>
            <p className="mt-1 text-[11px] text-white/65">Prévia estática do primeiro quadro. A transmissão ao vivo começa quando você abrir.</p>
            </div>
            <button
              type="button"
              onClick={() => onRevealScreenShare(participant.id)}
              aria-label={`Ver apresentação de ${participant.name}`}
              className="shrink-0 rounded-xl bg-theme-gradient px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Ver apresentação
            </button>
          </div>
        </div>
      )}

      {focused && onToggleFullscreen && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggleFullscreen(); }}
          aria-label={fullscreenActive ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
          title={fullscreenActive ? 'Sair da tela cheia' : 'Tela cheia'}
          className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-black/70 text-white shadow-lg backdrop-blur transition hover:scale-105 hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {fullscreenActive ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
      )}

      {participant.screenAudioTrack && !participant.isLocal && screenShareRevealed && (
        <div className="absolute right-3 top-[4.5rem] z-20 flex flex-col items-center gap-1">
          {showScreenVolume && <div className="flex h-36 items-center justify-center rounded-full border border-white/15 bg-black/75 px-3 py-2 shadow-xl backdrop-blur">
            <input
              aria-label={`Volume da apresentação de ${participant.name}`}
              title={`Volume da apresentação de ${participant.name}`}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={screenVolume}
              onChange={(event) => setScreenVolume(Number(event.target.value))}
              className="h-28 w-2 cursor-pointer"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: 'rgb(var(--d-brand))', touchAction: 'none' }}
            />
          </div>}
          <button
            type="button"
            onClick={() => setShowScreenVolume((shown) => !shown)}
            aria-label={`Ajustar volume da apresentação de ${participant.name}`}
            aria-expanded={showScreenVolume}
            title="Volume da apresentação"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-discord-brand/40 bg-discord-bg-secondary/95 text-discord-header-primary shadow-lg transition hover:bg-discord-brand/20"
          >
            <VolumeIcon muted={screenVolume === 0} />
          </button>
        </div>
      )}

      {(participant.stream || participant.soundboardTrack || participant.screenAudioTrack) && playbackBlocked && !participant.isLocal && (
        <button
          type="button"
          onClick={enablePlayback}
          className="absolute top-3 right-3 z-[11] rounded-lg bg-black/75 border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-black/90"
        >
          Clique para ativar áudio
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 px-2.5 py-2 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-xs sm:text-sm font-medium text-white truncate flex items-center gap-1.5">
          {participant.isSharingScreen && <ScreenShareIcon active />}
          {participant.name}
          {participant.isLocal && ' (você)'}
        </span>
        {!participant.micOn && (
          <span className="shrink-0 h-6 w-6 rounded-full bg-danger/90 flex items-center justify-center text-white">
            <MicIcon off />
          </span>
        )}
      </div>

      {!participant.isLocal && participant.stream?.getAudioTracks().length ? (
        <div className="absolute bottom-10 right-2 z-20 flex items-center gap-2 rounded-full bg-black/70 px-2 py-1.5 text-white">
          {showVolume && (
            <input
              aria-label={`Volume de ${participant.name}`}
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={mix.volume}
              onChange={(event) => writeCallUserMix(participant.id, { volume: Number(event.target.value), muted: Number(event.target.value) === 0 })}
              className="h-1 w-20 accent-blue-400"
            />
          )}
          <button
            type="button"
            onClick={() => setShowVolume((shown) => !shown)}
            aria-label={`Ajustar volume de ${participant.name}`}
            aria-expanded={showVolume}
            className="flex h-6 w-6 items-center justify-center"
          >
            <VolumeIcon muted={volume === 0} />
          </button>
        </div>
      ) : null}

      {participant.connectionState === 'connecting' && (
        <div className="absolute top-2 left-2 text-[11px] font-medium text-white/80 bg-black/50 rounded-full px-2 py-0.5">
          Conectando…
        </div>
      )}
      {participant.connectionState === 'disconnected' && (
        <div className="absolute top-2 left-2 text-[11px] font-medium text-warn bg-black/60 rounded-full px-2 py-0.5">
          Reconectando…
        </div>
      )}
      {participant.connectionState === 'failed' && (
        <div className="absolute top-2 left-2 text-[11px] font-medium text-warn bg-black/60 rounded-full px-2 py-0.5">
          Reconectando a chamada…
        </div>
      )}
      {userMenu && !participant.isLocal && (
        <CallUserMenu
          userId={participant.id}
          name={participant.name}
          x={userMenu.x}
          y={userMenu.y}
          soundEffectsMuted={soundEffectsMuted}
          onToggleSoundEffects={onToggleSoundEffects}
          onMessage={onMessageUser}
          onOpenProfile={onOpenProfile}
          onClose={() => setUserMenu(null)}
        />
      )}
    </div>
  );
}

function Avatar({ name, avatarUrl, isSpeaking = false }: { name: string; avatarUrl?: string | null; isSpeaking?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className={`h-20 w-20 sm:h-28 sm:w-28 rounded-full bg-theme-gradient flex items-center justify-center overflow-hidden text-2xl sm:text-3xl font-semibold text-white ring-4 ring-white/10 shadow-xl ${isSpeaking ? 'voice-speaking-avatar' : ''}`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : initial}
    </div>
  );
}
