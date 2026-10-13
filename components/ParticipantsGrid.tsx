'use client';

import type { Participant } from '@/lib/types';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import VideoTile from './VideoTile';

export default function ParticipantsGrid({
  participants,
  muteRemoteAudio = false,
  outputDeviceId = '',
  masterOutputVolume = 1,
  mutedSoundEffectUserIds = [],
  focusedParticipantId = null,
  revealedScreenShareIds,
  onRevealScreenShare,
  onSelectParticipant,
  hideOtherParticipants = false,
  onToggleOtherParticipants,
  onToggleFullscreen,
  fullscreenActive = false,
}: {
  participants: Participant[];
  muteRemoteAudio?: boolean;
  outputDeviceId?: string;
  masterOutputVolume?: number;
  mutedSoundEffectUserIds?: string[];
  focusedParticipantId?: string | null;
  revealedScreenShareIds: ReadonlySet<string>;
  onRevealScreenShare: (participantId: string) => void;
  onSelectParticipant?: (participantId: string) => void;
  hideOtherParticipants?: boolean;
  onToggleOtherParticipants?: () => void;
  onToggleFullscreen?: () => void;
  fullscreenActive?: boolean;
}) {
  const focusedParticipant = participants.find((participant) => participant.id === focusedParticipantId);
  if (focusedParticipant) {
    return (
      <div className="absolute inset-0 flex min-h-0 w-full flex-col gap-3 p-2 sm:gap-4 sm:p-4">
        <div className="flex min-h-0 w-full flex-1 justify-center">
          <VideoTile
            participant={focusedParticipant}
            muteRemoteAudio={muteRemoteAudio}
            outputDeviceId={outputDeviceId}
            masterOutputVolume={masterOutputVolume}
            soundEffectsMuted={mutedSoundEffectUserIds.includes(focusedParticipant.id)}
            screenShareRevealed={focusedParticipant.isLocal || revealedScreenShareIds.has(focusedParticipant.id)}
            onRevealScreenShare={onRevealScreenShare}
            focused
            onFocusParticipant={onSelectParticipant ? () => onSelectParticipant(focusedParticipant.id) : undefined}
            onToggleFullscreen={onToggleFullscreen}
            fullscreenActive={fullscreenActive}
          />
        </div>
        {participants.length > 1 && onToggleOtherParticipants && (
          <button
            type="button"
            onClick={onToggleOtherParticipants}
            aria-label={hideOtherParticipants ? 'Mostrar membros' : 'Ocultar membros'}
            aria-expanded={!hideOtherParticipants}
            title={hideOtherParticipants ? 'Mostrar membros' : 'Ocultar membros'}
            className={`absolute left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-3 py-2 text-white shadow-lg backdrop-blur transition hover:scale-105 hover:bg-black ${hideOtherParticipants ? 'bottom-3' : 'bottom-[6.75rem]'}`}
          >
            {hideOtherParticipants ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <Users className="h-4 w-4" />
          </button>
        )}
        {participants.length > 1 && !hideOtherParticipants && (
          <div className="w-full shrink-0 overflow-x-auto pb-1" aria-label="Outros participantes da chamada">
            <div className="mx-auto flex w-max gap-3">
              {participants.filter((participant) => participant.id !== focusedParticipant.id).map((participant) => (
                <div key={participant.id} className="w-36 shrink-0 sm:w-48">
                  <VideoTile
                    participant={participant}
                    muteRemoteAudio={muteRemoteAudio}
                    outputDeviceId={outputDeviceId}
                    masterOutputVolume={masterOutputVolume}
                    soundEffectsMuted={mutedSoundEffectUserIds.includes(participant.id)}
                    screenShareRevealed={participant.isLocal || revealedScreenShareIds.has(participant.id)}
                    onRevealScreenShare={onRevealScreenShare}
                    onFocusParticipant={() => onSelectParticipant?.(participant.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const count = participants.length;
  const cols = count <= 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : count <= 9 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className={`grid ${cols} gap-3 auto-rows-fr w-full h-full content-center`}>
      {participants.map((p) => (
        <VideoTile
          key={p.id}
          participant={p}
          muteRemoteAudio={muteRemoteAudio}
          outputDeviceId={outputDeviceId}
          masterOutputVolume={masterOutputVolume}
          soundEffectsMuted={mutedSoundEffectUserIds.includes(p.id)}
          screenShareRevealed={p.isLocal || revealedScreenShareIds.has(p.id)}
          onRevealScreenShare={onRevealScreenShare}
          onFocusParticipant={() => onSelectParticipant?.(p.id)}
        />
      ))}
    </div>
  );
}
