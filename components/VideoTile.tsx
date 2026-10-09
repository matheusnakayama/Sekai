'use client';

import { useEffect, useRef, useState } from 'react';
import type { Participant } from '@/lib/types';
import { FocusIcon, MicIcon, ScreenShareIcon, VolumeIcon } from './icons';

export default function VideoTile({
  participant,
  muteRemoteAudio = false,
  soundEffectsMuted = false,
  focused = false,
  onFocusPresentation,
  onExitPresentationFocus,
}: {
  participant: Participant;
  muteRemoteAudio?: boolean;
  soundEffectsMuted?: boolean;
  focused?: boolean;
  onFocusPresentation?: () => void;
  onExitPresentationFocus?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const soundboardAudioRef = useRef<HTMLAudioElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const [videoLive, setVideoLive] = useState(false);
  const showVideo = (participant.camOn || participant.isSharingScreen) && videoLive;

  useEffect(() => {
    const tracks = participant.stream?.getVideoTracks() ?? [];
    const update = () => setVideoLive(tracks.some((track) => track.readyState === 'live' && !track.muted));
    update();
    tracks.forEach((track) => {
      track.addEventListener('unmute', update);
      track.addEventListener('mute', update);
      track.addEventListener('ended', update);
    });
    return () => {
      tracks.forEach((track) => {
        track.removeEventListener('unmute', update);
        track.removeEventListener('mute', update);
        track.removeEventListener('ended', update);
      });
    };
  }, [participant.stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !participant.stream) return;

    if (video.srcObject !== participant.stream) video.srcObject = participant.stream;
    video.volume = volume;
    // Alguns navegadores bloqueiam o áudio remoto até a pessoa interagir com a
    // página. Tente iniciar a reprodução e ofereça um botão se houver bloqueio.
    void video.play().then(() => setPlaybackBlocked(false)).catch(() => {
      if (!participant.isLocal) setPlaybackBlocked(true);
    });
  }, [participant.isLocal, participant.stream, showVideo, volume]);

  useEffect(() => {
    const audio = soundboardAudioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = participant.isLocal || volume === 0 || muteRemoteAudio || soundEffectsMuted;
    if (!participant.soundboardTrack) {
      audio.srcObject = null;
      return;
    }

    audio.srcObject = new MediaStream([participant.soundboardTrack]);
    void audio.play().then(() => setPlaybackBlocked(false)).catch(() => {
      if (!participant.isLocal && !muteRemoteAudio && !soundEffectsMuted) setPlaybackBlocked(true);
    });
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [muteRemoteAudio, participant.isLocal, participant.soundboardTrack, soundEffectsMuted, volume]);

  async function enablePlayback() {
    try {
      await videoRef.current?.play();
      if (participant.soundboardTrack) await soundboardAudioRef.current?.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  }

  return (
    <div
      className={focused
        ? 'relative h-full min-h-0 w-full overflow-hidden bg-black'
        : `relative rounded-xl overflow-hidden bg-surface-card border transition-shadow ${
            participant.isSpeaking ? 'voice-speaking-tile' : 'border-surface-border'
          }`}
    >
      <div className={`relative w-full h-full ${focused ? 'min-h-0 bg-black' : 'aspect-video bg-gradient-to-br from-surface-card to-surface'}`}>
        {participant.stream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={participant.isLocal || volume === 0 || (muteRemoteAudio && !participant.isLocal)}
            className={`absolute inset-0 h-full w-full ${participant.isSharingScreen ? 'object-contain' : 'object-cover'} ${showVideo ? '' : 'invisible'} ${participant.isLocal && !participant.isSharingScreen ? 'scale-x-[-1]' : ''}`}
          />
        )}
        <audio ref={soundboardAudioRef} autoPlay playsInline className="hidden" />
        {!showVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Avatar name={participant.name} avatarUrl={participant.avatarUrl} isSpeaking={participant.isSpeaking} />
          </div>
        )}
      </div>

      {participant.isSharingScreen && (focused ? onExitPresentationFocus : onFocusPresentation) && (
        <button
          type="button"
          onClick={focused ? onExitPresentationFocus : onFocusPresentation}
          aria-label={focused ? 'Sair da apresentação em tela cheia' : 'Ampliar apresentação em tela cheia'}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black/90"
        >
          <FocusIcon />
          {focused ? 'Sair do foco' : 'Tela cheia'}
        </button>
      )}

      {participant.stream && playbackBlocked && !participant.isLocal && (
        <button
          type="button"
          onClick={enablePlayback}
          className="absolute top-3 right-3 rounded-lg bg-black/75 border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-black/90"
        >
          Clique para ativar áudio
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 py-2 bg-gradient-to-t from-black/60 to-transparent">
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
        <div className="absolute bottom-10 right-2 flex items-center gap-2 rounded-full bg-black/70 px-2 py-1.5 text-white">
          {showVolume && (
            <input
              aria-label={`Volume de ${participant.name}`}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
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
