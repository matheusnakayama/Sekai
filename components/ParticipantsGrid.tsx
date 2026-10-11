'use client';

import type { Participant } from '@/lib/types';
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
  onExitParticipantFocus,
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
  onExitParticipantFocus?: () => void;
}) {
  const focusedParticipant = participants.find((participant) => participant.id === focusedParticipantId);
  if (focusedParticipant) {
    return (
      <div className="absolute inset-0 flex min-h-0 w-full flex-col gap-3">
        <div className="min-h-0 w-full flex-1">
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
            onExitPresentationFocus={onExitParticipantFocus}
          />
        </div>
        {participants.length > 1 && (
          <div className="flex shrink-0 gap-3 overflow-x-auto pb-1" aria-label="Outros participantes da chamada">
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
