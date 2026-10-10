export type SignalPayload =
  | { type: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit; generation?: number; relay?: boolean }
  | { type: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit; generation?: number }
  | { type: 'ice-candidate'; from: string; to: string; candidate: RTCIceCandidateInit; generation?: number }
  | { type: 'ice-candidates'; from: string; to: string; candidates: RTCIceCandidateInit[]; generation?: number }
  | { type: 'screen-share-state'; from: string; sharing: boolean }
  | { type: 'media-state'; from: string; micOn: boolean; camOn: boolean }
  | { type: 'peer-reset'; from: string; to: string; generation?: number; relay?: boolean; request?: boolean }
  | { type: 'screen-offer'; from: string; to: string; sdp: RTCSessionDescriptionInit; generation: number }
  | { type: 'screen-answer'; from: string; to: string; sdp: RTCSessionDescriptionInit; generation: number }
  | { type: 'screen-ice'; from: string; to: string; candidate: RTCIceCandidateInit; as: 'sharer' | 'viewer'; generation: number }
  | { type: 'screen-ice-bundle'; from: string; to: string; candidates: RTCIceCandidateInit[]; as: 'sharer' | 'viewer'; generation: number }
  | { type: 'screen-stop'; from: string }
  | { type: 'screen-replay'; from: string; to: string; relay?: boolean };

export interface PresenceMemberInfo {
  name: string;
  joinedAt: number;
  avatarUrl?: string | null;
}

export interface Participant {
  id: string; // pusher connection/member id
  name: string;
  avatarUrl?: string | null;
  stream?: MediaStream;
  soundboardTrack?: MediaStreamTrack;
  screenAudioTrack?: MediaStreamTrack;
  micOn: boolean;
  camOn: boolean;
  isSpeaking: boolean;
  isSharingScreen: boolean;
  isLocal: boolean;
  connectionState?: RTCPeerConnectionState;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
  imageUrl?: string;
  isSystem?: boolean;
}

export type RoomModerationAction = 'kick' | 'mute' | 'unmute' | 'promote' | 'epstein';

export interface RoomModerationEvent {
  action: RoomModerationAction;
  targetId: string;
  targetName: string;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type CallErrorKind =
  | 'permission-denied'
  | 'device-not-found'
  | 'connection-unstable'
  | 'join-failed'
  | 'room-full'
  | 'unknown';

export interface CallError {
  kind: CallErrorKind;
  message: string;
}
