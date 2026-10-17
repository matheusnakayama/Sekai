'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import type { Channel } from 'pusher-js';
import { uploadPresigned } from '@vercel/blob/client';
import PreJoin from '@/components/PreJoin';
import Controls, { type AudioDeviceOption, type ScreenShareSettings, type SoundboardEffect, type VoiceAudioSettings, type VoiceProfile } from '@/components/Controls';
import ParticipantsGrid from '@/components/ParticipantsGrid';
import ParticipantsPanel from '@/components/ParticipantsPanel';
import ChatPanel from '@/components/ChatPanel';
import ErrorBanner from '@/components/ErrorBanner';
import ThemePicker from '@/components/ThemePicker';
import GoLivePicker, { type GoLiveSelection } from '@/components/call/GoLivePicker';
import PresentationMiniPreview from '@/components/call/PresentationMiniPreview';
import { createClient } from '@/lib/supabase/client';
import { subscribeToRoom, disconnectPusher, getPusherClient } from '@/lib/pusherClient';
import { WebRTCManager, type VideoSenderProfile } from '@/lib/webrtc';
import { microphoneEnabledOnJoin, readCallAudioPreference, writeCallAudioPreference, type CallAudioPreference } from '@/lib/callAudioPreference';
import { isPlayableAudioFile, startCallMusicPlayback, stopCallMusicPlayback, type CallMusicPlayback } from '@/lib/callMusic';
import { buildDisplayMediaRequest, prepareScreenAudioTrack, screenShareFailureMessage } from '@/lib/screenShare';
import { advanceVoiceGate, createVoiceGate, openCallInput, releaseCallInput, releaseCallInputTrack, setVoiceInputVolume, voiceDeviceId } from '@/lib/voiceCapture';
import { readVoicePreferences, saveVoicePreferences, VOICE_PREFERENCES_UPDATED_EVENT, type VoicePreferences } from '@/lib/voicePreferences';
import { playUiSound } from '@/lib/uiSounds';
import { inviteUrl } from '@/lib/invites';
import type {
  CallError,
  IceServerConfig,
  Participant,
  RoomChatMessage,
  RoomModerationAction,
  RoomModerationEvent,
} from '@/lib/types';

type Phase = 'pre-join' | 'connecting' | 'in-call' | 'left' | 'kicked' | 'fatal-error';

interface PresenceMember {
  id: string;
  info: { name: string; joinedAt: number; avatarUrl?: string | null };
}

interface PresenceMembersSnapshot {
  each: (callback: (member: PresenceMember) => void) => void;
}

type DocumentPictureInPictureApi = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
};

type WindowWithDocumentPictureInPicture = Window & {
  documentPictureInPicture?: DocumentPictureInPictureApi;
};

export default function RoomClient({
  roomId,
  serverId,
  roomName,
  initialName,
  accessToken,
  onClose,
  onMinimize,
  onRestoreCall,
  callFullscreen = false,
  onToggleCallFullscreen,
  callVisible = true,
  onParticipantsChange,
  onAddFriend,
  onControlsReady,
  onControlStateChange,
  onConnectionQualityChange,
  mutedSoundEffectUserIds = [],
  autoJoin = false,
  userId,
  onOpenVoiceSettings,
}: {
  userId?: string;
  roomId: string;
  serverId?: string;
  roomName: string;
  initialName: string;
  accessToken: string;
  onClose: () => void;
  /** Volta para o Sekai sem sair da chamada (o áudio continua). */
  onMinimize?: () => void;
  /** Abre novamente a chamada, mesmo se a pessoa estiver em outra página/canal. */
  onRestoreCall?: () => void;
  /** Alterna o modo de chamada imersiva no layout principal do app. */
  callFullscreen?: boolean;
  onToggleCallFullscreen?: () => void;
  callVisible?: boolean;
  onParticipantsChange?: (participants: Participant[]) => void;
  onAddFriend?: (userId: string) => void;
  onControlsReady?: (controls: {
    toggleMic: () => void;
    toggleDeafen: () => void;
    toggleCam: () => void;
    toggleScreenShare: () => Promise<void>;
    playSoundEffect: (effect: SoundboardEffect) => Promise<boolean>;
    audioSettings: VoiceAudioSettings;
    selectInputDevice: (deviceId: string) => void;
    selectOutputDevice: (deviceId: string) => void;
    setInputVolume: (volume: number) => void;
    setOutputVolume: (volume: number) => void;
    setVoiceProfile: (profile: VoiceProfile) => void;
  } | null) => void;
  onControlStateChange?: (state: { micOn: boolean; deafened: boolean; camOn: boolean; isSpeaking: boolean }) => void;
  onConnectionQualityChange?: (pingMs: number | null) => void;
  mutedSoundEffectUserIds?: string[];
  onOpenVoiceSettings?: () => void;
  /** Entra direto, sem a tela de pré-visualização. A câmera começa desligada e o microfone segue o último estado da call. */
  autoJoin?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('pre-join');
  const [autoJoining, setAutoJoining] = useState(autoJoin);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [micOn, setMicOn] = useState(() => readCallAudioPreference().micOn);
  const [deafened, setDeafened] = useState(() => readCallAudioPreference().deafened);
  const [inputDevices, setInputDevices] = useState<AudioDeviceOption[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('');
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState('');
  const [inputVolume, setInputVolume] = useState(1);
  const [outputVolume, setOutputVolume] = useState(1);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>('standard');
  const [outputDeviceSelectionSupported, setOutputDeviceSelectionSupported] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [micLockedByHost, setMicLockedByHost] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenShareSettings, setScreenShareSettings] = useState<ScreenShareSettings>({ height: 1080, frameRate: 60 });
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [goLiveBusy, setGoLiveBusy] = useState(false);
  const [screenCaptureInfo, setScreenCaptureInfo] = useState('');
  const [soundEffects, setSoundEffects] = useState<SoundboardEffect[]>([]);
  const [soundEffectsLoading, setSoundEffectsLoading] = useState(false);
  const [playingSoundId, setPlayingSoundId] = useState<string | null>(null);
  const [callMusicName, setCallMusicName] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [hostId, setHostId] = useState('');
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [revealedScreenShareIds, setRevealedScreenShareIds] = useState<Set<string>>(() => new Set());
  const [presentationPipWindow, setPresentationPipWindow] = useState<Window | null>(null);
  const [hideOtherParticipants, setHideOtherParticipants] = useState(false);
  const [fatalError, setFatalError] = useState<CallError | null>(null);
  const [banner, setBanner] = useState<{ message: string; connection: boolean; persistent?: boolean } | null>(null);
  const audioPreferenceRef = useRef<CallAudioPreference>(readCallAudioPreference());
  const [pendingPrankPrompt, setPendingPrankPrompt] = useState<{ senderName: string } | null>(null);

  const localIdRef = useRef<string>('');
  const localNameRef = useRef<string>('');
  const onCloseRef = useRef(onClose);
  const roomSessionRef = useRef('');
  const participantNamesRef = useRef(new Map<string, string>());
  const participantAvatarsRef = useRef(new Map<string, string | null>());
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const chatOpenRef = useRef(false);
  const hostIdRef = useRef('');
  const remoteScreenSharingIdsRef = useRef(new Set<string>());
  const memberJoinTimesRef = useRef(new Map<string, number>());
  const micLockedByHostRef = useRef(false);
  const managerRef = useRef<WebRTCManager | null>(null);
  const changeCallInputRef = useRef<(deviceId: string, profile?: VoiceProfile) => Promise<void>>(async () => {});
  const channelRef = useRef<Channel | null>(null);
  const camBeforeShareRef = useRef(true);
  const screenShareOperationRef = useRef(false);
  const callMusicRef = useRef<CallMusicPlayback | null>(null);
  const musicGenerationRef = useRef(0);
  const soundboardSendRef = useRef(Promise.resolve());
  const releaseCallMusicRef = useRef<() => void>(() => {});
  const supabase = createClient();
  onCloseRef.current = onClose;

  useEffect(() => {
    const updateOverlayCall = window.sekaiDesktop?.updateOverlayCall;
    if (typeof updateOverlayCall !== 'function') return;
    const active = phase === 'in-call';
    const publishOverlayState = () => {
      const brandChannels = getComputedStyle(document.documentElement).getPropertyValue('--brand-500').trim().split(/\s+/).map(Number);
      const accentColor = brandChannels.length === 3 && brandChannels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)
        ? `#${brandChannels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
        : '#22c55e';
      updateOverlayCall({
        callName: active ? roomName : '',
        accentColor,
        participants: active ? Object.values(participants).map((participant) => ({
          id: participant.id,
          name: participant.name,
          avatarUrl: participant.avatarUrl || '',
          isSpeaking: participant.isLocal ? localSpeaking : participant.isSpeaking,
          micOn: participant.micOn,
        })) : [],
      });
    };
    publishOverlayState();
    const themeObserver = new MutationObserver(publishOverlayState);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => themeObserver.disconnect();
  }, [localSpeaking, participants, phase, roomName]);

  useEffect(() => {
    if (!userId) return;
    const applyPreferences = (preferences: VoicePreferences) => {
      setSelectedInputDeviceId(preferences.inputDeviceId);
      setSelectedOutputDeviceId(preferences.outputDeviceId);
      setInputVolume(preferences.inputVolume);
      setOutputVolume(preferences.outputVolume);
      setVoiceProfile(preferences.voiceProfile);
      setVoiceInputVolume(cameraStreamRef.current?.getAudioTracks()[0], preferences.inputVolume);
    };

    applyPreferences(readVoicePreferences(userId));
    const handlePreferencesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; preferences?: VoicePreferences }>).detail;
      if (detail?.userId !== userId || !detail.preferences) return;
      const next = detail.preferences;
      const inputChanged = next.inputDeviceId !== selectedInputDeviceId || next.voiceProfile !== voiceProfile;
      applyPreferences(next);
      if (inputChanged && phase === 'in-call') {
        void changeCallInputRef.current(next.inputDeviceId, next.voiceProfile);
      }
    };
    window.addEventListener(VOICE_PREFERENCES_UPDATED_EVENT, handlePreferencesUpdated);
    return () => window.removeEventListener(VOICE_PREFERENCES_UPDATED_EVENT, handlePreferencesUpdated);
  }, [phase, selectedInputDeviceId, userId, voiceProfile]);

  const activeMicrophoneTrackId = participants[localIdRef.current]?.stream?.getAudioTracks()[0]?.id ?? '';

  useEffect(() => {
    onParticipantsChange?.(phase === 'in-call' ? Object.values(participants) : []);
  }, [onParticipantsChange, participants, phase]);

  useEffect(() => {
    onControlStateChange?.({ micOn, deafened, camOn, isSpeaking: phase === 'in-call' && localSpeaking });
  }, [micOn, deafened, camOn, localSpeaking, phase, onControlStateChange]);

  useEffect(() => {
    if (phase !== 'in-call') {
      onConnectionQualityChange?.(null);
      return;
    }
    let cancelled = false;
    const updatePing = async () => {
      const ping = await managerRef.current?.getMedianRoundTripTimeMs().catch(() => null) ?? null;
      if (!cancelled) onConnectionQualityChange?.(ping);
    };
    void updatePing();
    const timer = window.setInterval(() => void updatePing(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      onConnectionQualityChange?.(null);
    };
  }, [onConnectionQualityChange, phase]);

  useEffect(() => {
    const track = cameraStreamRef.current?.getAudioTracks()[0];
    if (track) setVoiceInputVolume(track, inputVolume);
  }, [inputVolume, phase]);

  useEffect(() => {
    if (phase !== 'in-call' || !navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    const refreshDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const inputs = devices.filter((device) => device.kind === 'audioinput').map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microfone ${index + 1}`,
        }));
        const outputs = devices.filter((device) => device.kind === 'audiooutput').map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Saída de áudio ${index + 1}`,
        }));
        setInputDevices(inputs);
        setOutputDevices(outputs);
        setSelectedInputDeviceId((current) => current || voiceDeviceId(cameraStreamRef.current?.getAudioTracks()[0]) || inputs[0]?.deviceId || '');
        setOutputDeviceSelectionSupported(typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype);
      } catch (error) {
        console.warn('Não foi possível listar os dispositivos de áudio:', error);
      }
    };
    void refreshDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshDevices);
    };
  }, [phase]);

  const cleanup = useCallback(() => {
    managerRef.current?.destroy();
    managerRef.current = null;
    channelRef.current?.unbind('client-chat-message');
    channelRef.current?.unbind('client-moderation');
    channelRef.current?.unbind('server-moderation');
    channelRef.current = null;
    releaseCallInput(cameraStreamRef.current);
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    releaseCallMusicRef.current();
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    screenAudioTrackRef.current = null;
    participantNamesRef.current.clear();
    participantAvatarsRef.current.clear();
    memberJoinTimesRef.current.clear();
    roomSessionRef.current = '';
    localIdRef.current = '';
    disconnectPusher();
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    if (!serverId || phase !== 'in-call') return;
    let cancelled = false;
    let checking = false;
    let disconnected = false;

    const enforceServerRestrictions = async () => {
      if (cancelled || checking || disconnected || !localIdRef.current) return;
      checking = true;
      try {
        const { data: membership, error: membershipError } = await supabase.from('members')
          .select('is_banned, communication_disabled_until')
          .eq('server_id', serverId)
          .eq('user_id', localIdRef.current)
          .maybeSingle();
        if (cancelled || membershipError) return;

        let durableTimeoutUntil: string | null = null;
        const { data: timeout, error: timeoutError } = await supabase.from('guild_timeouts')
          .select('until_at')
          .eq('server_id', serverId)
          .eq('user_id', localIdRef.current)
          .maybeSingle();
        if (!timeoutError) durableTimeoutUntil = timeout?.until_at ?? null;

        const activeTimeout = Boolean(
          (membership?.communication_disabled_until && Date.parse(membership.communication_disabled_until) > Date.now()) ||
          (durableTimeoutUntil && Date.parse(durableTimeoutUntil) > Date.now())
        );
        if (!membership || membership.is_banned || activeTimeout) {
          disconnected = true;
          cleanup();
          onCloseRef.current();
        }
      } finally {
        checking = false;
      }
    };

    const channel = supabase.channel(`sekai-member-restrictions:${serverId}:${localIdRef.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `user_id=eq.${localIdRef.current}` }, () => {
        void enforceServerRestrictions();
      })
      .subscribe();
    void enforceServerRestrictions();
    const timer = window.setInterval(() => void enforceServerRestrictions(), 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [cleanup, phase, roomId, serverId, supabase]);

  useEffect(() => {
    let cancelled = false;
    setSoundEffects([]);
    if (!serverId) {
      setSoundEffectsLoading(false);
      return;
    }

    setSoundEffectsLoading(true);
    void supabase
      .from('server_assets')
      .select('id, name, asset_url')
      .eq('server_id', serverId)
      .eq('kind', 'sound')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Não foi possível carregar os efeitos sonoros do servidor:', error.message);
          setSoundEffects([]);
        } else {
          setSoundEffects((data ?? []).map((row) => ({ id: row.id, name: row.name, assetUrl: row.asset_url })));
        }
        setSoundEffectsLoading(false);
      });

    return () => { cancelled = true; };
  }, [serverId, supabase]);

  useEffect(() => {
    const track = cameraStreamRef.current?.getAudioTracks()[0];
    if (!track || !micOn || phase !== 'in-call' || deafened) {
      setLocalSpeaking(false);
      updateLocalParticipant({ isSpeaking: false });
      managerRef.current?.broadcastMediaState({
        micOn: currentMicRef.current,
        camOn: currentCamRef.current,
        deafened: currentDeafenedRef.current,
        isSpeaking: false,
      });
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    const source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);
    const resumeContext = () => {
      if (context.state === 'suspended') void context.resume().catch(() => {});
    };
    void context.resume().catch(() => {});
    window.addEventListener('pointerdown', resumeContext);
    window.addEventListener('keydown', resumeContext);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let gate = createVoiceGate();
    const sample = (time: number) => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) { const centered = (value - 128) / 128; sum += centered * centered; }
      const rms = Math.sqrt(sum / samples.length);
      const next = advanceVoiceGate(gate, rms, time);
      if (next.speaking !== gate.speaking) {
        setLocalSpeaking(next.speaking);
        updateLocalParticipant({ isSpeaking: next.speaking });
        managerRef.current?.broadcastMediaState({
          micOn: currentMicRef.current,
          camOn: currentCamRef.current,
          deafened: currentDeafenedRef.current,
          isSpeaking: next.speaking,
        });
      }
      gate = next;
      frame = window.requestAnimationFrame(sample);
    };
    frame = window.requestAnimationFrame(sample);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', resumeContext);
      window.removeEventListener('keydown', resumeContext);
      source.disconnect();
      void context.close();
      setLocalSpeaking(false);
      updateLocalParticipant({ isSpeaking: false });
      managerRef.current?.broadcastMediaState({
        micOn: currentMicRef.current,
        camOn: currentCamRef.current,
        deafened: currentDeafenedRef.current,
        isSpeaking: false,
      });
    };
  }, [activeMicrophoneTrackId, micOn, phase, deafened]);

  function updateHost(nextHostId: string) {
    hostIdRef.current = nextHostId;
    setHostId(nextHostId);
  }

  function electHostFromPresence() {
    const oldest = Array.from(memberJoinTimesRef.current.entries())
      .sort(([idA, timeA], [idB, timeB]) => timeA - timeB || idA.localeCompare(idB))[0];
    updateHost(oldest?.[0] ?? '');
  }

  useEffect(() => {
    if (focusedParticipantId && !participants[focusedParticipantId]) setFocusedParticipantId(null);
  }, [focusedParticipantId, participants]);

  async function handleJoin(opts: {
    name: string;
    stream: MediaStream | null;
    camOn: boolean;
    micOn: boolean;
  }) {
    setPhase('connecting');
    remoteScreenSharingIdsRef.current.clear();
    setRevealedScreenShareIds(new Set());
    setChatMessages([]);
    setChatUnreadCount(0);
    memberJoinTimesRef.current.clear();
    updateHost('');
    micLockedByHostRef.current = false;
    setMicLockedByHost(false);
    setShowChat(false);
    chatOpenRef.current = false;
    cameraStreamRef.current = opts.stream;
    currentMicRef.current = opts.micOn;
    setMicOn(opts.micOn);
    if (opts.micOn) setDeafened(false);
    setCamOn(opts.camOn);

    try {
      const sessionResponse = await fetch('/api/pusher/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const sessionData = await sessionResponse.json() as {
        userId?: unknown;
        token?: unknown;
        displayName?: unknown;
        avatarUrl?: unknown;
        error?: unknown;
      };
      if (!sessionResponse.ok || typeof sessionData.userId !== 'string' ||
        typeof sessionData.token !== 'string' || typeof sessionData.displayName !== 'string') {
        throw new Error(typeof sessionData.error === 'string' ? sessionData.error : 'Não foi possível criar a sessão da sala.');
      }
      const joinedName = sessionData.displayName;
      const avatarUrl = typeof sessionData.avatarUrl === 'string' ? sessionData.avatarUrl : null;
      localNameRef.current = joinedName;
      localIdRef.current = sessionData.userId;
      roomSessionRef.current = sessionData.token;
      participantNamesRef.current.set(localIdRef.current, joinedName);
      participantAvatarsRef.current.set(localIdRef.current, avatarUrl);
      setParticipants({
        [localIdRef.current]: {
          id: localIdRef.current,
          name: joinedName,
          joinedAt: Date.now(),
          avatarUrl,
          stream: opts.stream ?? undefined,
          micOn: opts.micOn,
          isDeafened: deafened,
          camOn: opts.camOn,
          isSpeaking: false,
          isSharingScreen: false,
          isLocal: true,
        },
      });

      const iceServers = await fetchIceServers(accessToken);
      const channel = subscribeToRoom(roomId, joinedName, localIdRef.current, roomSessionRef.current, avatarUrl, accessToken);
      channelRef.current = channel;
      channel.bind('server-moderation', (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const event = payload as { serverId?: unknown; targetId?: unknown };
        if (event.serverId !== serverId || event.targetId !== localIdRef.current) return;
        appendSystemChatMessage('Sua participação na chamada foi encerrada por um moderador do servidor.');
        cleanup();
        onCloseRef.current();
      });
      channel.bind('client-chat-message', (payload: unknown, metadata?: unknown) => {
        const senderId = getPusherEventUserId(metadata);
        const message = normalizeChatMessage(payload, senderId, participantNamesRef.current.get(senderId ?? ''));
        if (!message || message.senderId === localIdRef.current) return;
        appendChatMessage(message);
      });
      channel.bind('client-moderation', (payload: unknown, metadata?: unknown) => {
        const moderation = normalizeModerationEvent(payload);
        if (!moderation || getPusherEventUserId(metadata) !== hostIdRef.current) return;
        if ((moderation.action === 'promote' || moderation.action === 'epstein') && !memberJoinTimesRef.current.has(moderation.targetId)) return;

        const targetIsLocal = moderation.targetId === localIdRef.current;
        if (moderation.action === 'epstein') {
          if (targetIsLocal) {
            const senderId = getPusherEventUserId(metadata);
            setPendingPrankPrompt({
              senderName: senderId === localIdRef.current
                ? 'O anfitrião'
                : participantNamesRef.current.get(senderId ?? '') || 'O anfitrião',
            });
          }
          return;
        }

        const actionText = moderation.action === 'kick'
          ? `${moderation.targetName} foi removido da sala.`
          : moderation.action === 'mute'
            ? `${moderation.targetName} foi silenciado pelo anfitrião.`
            : moderation.action === 'unmute'
              ? `${moderation.targetName} teve o microfone liberado pelo anfitrião.`
              : `${moderation.targetName} agora é o anfitrião da sala.`;

        if (moderation.action === 'kick' && targetIsLocal) {
          appendSystemChatMessage('Você foi removido da sala pelo anfitrião.');
          cleanup();
          chatOpenRef.current = false;
          setShowChat(false);
          setPhase('kicked');
          return;
        }

        appendSystemChatMessage(actionText);
        if (targetIsLocal && moderation.action === 'mute') void applyHostMicState(true);
        if (targetIsLocal && moderation.action === 'unmute') void applyHostMicState(false);
        if (moderation.action === 'promote') updateHost(moderation.targetId);
      });

      const manager = new WebRTCManager(channel, localIdRef.current, accessToken);
      manager.setIceServers(iceServers);
      if (opts.stream) manager.setLocalStream(opts.stream);
      managerRef.current = manager;

      manager.onTrack = (peerId, stream) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId), participantAvatarsRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, stream } };
        });
      };

      manager.onSoundboardTrack = (peerId, track) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId), participantAvatarsRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, soundboardTrack: track } };
        });
      };

      manager.onScreenAudioTrack = (peerId, track) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId), participantAvatarsRef.current.get(peerId));
          if (!track && !prev[peerId]) return prev;
          return { ...prev, [peerId]: { ...participant, screenAudioTrack: track ?? undefined } };
        });
        track?.addEventListener('ended', () => {
          setParticipants((prev) => {
            const participant = prev[peerId];
            if (!participant || participant.screenAudioTrack !== track) return prev;
            return { ...prev, [peerId]: { ...participant, screenAudioTrack: undefined } };
          });
        }, { once: true });
      };

      manager.onConnectionStateChange = (peerId, state) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId), participantAvatarsRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, connectionState: state } };
        });
        if (state === 'failed') {
          showProblem('A conexão com um dos participantes ficou instável.', true);
        }
      };

      manager.onSpeakingChange = (peerId, speaking) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId), participantAvatarsRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, isSpeaking: speaking } };
        });
      };

      manager.onAudioTransportProblem = (peerId, attempt, turnAvailable) => {
        const participantName = participantNamesRef.current.get(peerId) || 'o outro participante';
        showProblem(
          attempt === 1
            ? `O áudio de ${participantName} não está chegando apesar da chamada conectada. O Sekai está tentando restabelecer a rota de voz.${turnAvailable ? '' : ' O servidor TURN não está disponível; isso pode impedir a conexão entre redes diferentes.'}`
            : `O áudio de ${participantName} continuou sem chegar após a recuperação automática.${turnAvailable ? '' : ' O servidor TURN não está disponível para esta chamada.'} Saiam e entrem novamente na chamada com a versão mais recente do Sekai.`,
          true,
          attempt > 1,
        );
      };

      manager.onScreenShareState = (peerId, sharing) => {
        const wasSharing = remoteScreenSharingIdsRef.current.has(peerId);
        if (sharing) remoteScreenSharingIdsRef.current.add(peerId);
        else remoteScreenSharingIdsRef.current.delete(peerId);
        if (wasSharing !== sharing) {
          setRevealedScreenShareIds((current) => {
            if (!current.has(peerId)) return current;
            const next = new Set(current);
            next.delete(peerId);
            return next;
          });
        }
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId), participantAvatarsRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, isSharingScreen: sharing } };
        });
      };

      manager.onScreenShareFailure = (peerId) => {
        const participantName = participantNamesRef.current.get(peerId) || 'um participante';
        showProblem(
          `Sua tela foi capturada, mas não chegou para ${participantName}. A conexão de vídeo falhou; isso pode ser causado por bloqueio de rede, firewall ou VPN, ou por uma limitação do navegador ou do PC. A chamada está tentando reconectar.`,
          false,
          true,
        );
      };

      manager.onMediaState = (peerId, state) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId), participantAvatarsRef.current.get(peerId));
          return {
            ...prev,
            [peerId]: {
              ...participant,
              micOn: state.micOn,
              camOn: state.camOn,
              isDeafened: state.deafened ?? participant.isDeafened ?? false,
              isSpeaking: state.isSpeaking ?? participant.isSpeaking,
            },
          };
        });
      };

      channel.bind('pusher:subscription_succeeded', (members: PresenceMembersSnapshot) => {
        const others: PresenceMember[] = [];
        members.each((m: PresenceMember) => {
          memberJoinTimesRef.current.set(m.id, Number.isFinite(m.info?.joinedAt) ? m.info.joinedAt : Date.now());
          if (m.id !== localIdRef.current) {
            participantNamesRef.current.set(m.id, m.info?.name || 'Convidado');
            participantAvatarsRef.current.set(m.id, m.info?.avatarUrl ?? null);
            others.push(m);
          }
        });
        electHostFromPresence();

        setParticipants((prev) => {
          const next = { ...prev };
          for (const m of others) {
            const participant = createRemoteParticipant(m.id, m.info?.name || 'Convidado', m.info?.avatarUrl, m.info?.joinedAt);
            next[m.id] = {
              ...participant,
              ...prev[m.id],
              name: m.info?.name || 'Convidado',
              avatarUrl: m.info?.avatarUrl ?? null,
              joinedAt: Number.isFinite(m.info?.joinedAt) ? m.info.joinedAt : Date.now(),
            };
          }
          return next;
        });

        setPhase('in-call');
        playUiSound('call-join');

        others.forEach((member) => manager.preparePeerConnection(member.id));

        // O recém-chegado não recebe o evento member_added dos participantes
        // existentes; anuncie o estado inicial do microfone para o monitor RTP.
        manager.broadcastMediaState({
          micOn: currentMicRef.current,
          camOn: currentCamRef.current,
          deafened: currentDeafenedRef.current,
          isSpeaking: false,
        });

        // Um lado só inicia a conexão de cada par, evitando ofertas simultâneas.
        others.forEach((m) => {
          if (localIdRef.current < m.id) {
            manager.callPeer(m.id).catch(() => {
              showProblem(`Não foi possível conectar com ${m.info?.name || 'um participante'}.`, true);
            });
          }
          if (currentSharingRef.current) void manager.offerScreenTo(m.id);
        });
      });

      channel.bind('pusher:member_added', (member: PresenceMember) => {
        const memberName = member.info?.name || 'Convidado';
        participantNamesRef.current.set(member.id, memberName);
        participantAvatarsRef.current.set(member.id, member.info?.avatarUrl ?? null);
        memberJoinTimesRef.current.set(
          member.id,
          Number.isFinite(member.info?.joinedAt) ? member.info.joinedAt : Date.now()
        );
        if (!memberJoinTimesRef.current.has(hostIdRef.current)) electHostFromPresence();
        setParticipants((prev) => {
          const participant = createRemoteParticipant(member.id, memberName, member.info?.avatarUrl, member.info?.joinedAt);
          return {
            ...prev,
            [member.id]: { ...participant, ...prev[member.id], name: memberName, avatarUrl: member.info?.avatarUrl ?? null, joinedAt: Number.isFinite(member.info?.joinedAt) ? member.info.joinedAt : Date.now() },
          };
        });
        playUiSound('call-join');
        manager.preparePeerConnection(member.id);
        if (localIdRef.current < member.id) {
          manager.callPeer(member.id).catch(() => {
            showProblem(`Não foi possível conectar com ${memberName}.`, true);
          });
        }
        // Avisa o recém-chegado sobre nosso estado atual (ele só recebe eventos futuros).
        manager.broadcastMediaState({ micOn: currentMicRef.current, camOn: currentCamRef.current, deafened: currentDeafenedRef.current });
        if (currentSharingRef.current) {
          manager.broadcastScreenShareState(true);
          void manager.offerScreenTo(member.id);
        }
      });

      channel.bind('pusher:member_removed', (member: PresenceMember) => {
        playUiSound('call-leave');
        manager.hangupPeer(member.id);
        participantNamesRef.current.delete(member.id);
        participantAvatarsRef.current.delete(member.id);
        memberJoinTimesRef.current.delete(member.id);
        if (member.id === hostIdRef.current) electHostFromPresence();
        setParticipants((prev) => {
          const next = { ...prev };
          delete next[member.id];
          return next;
        });
      });

      channel.bind('pusher:subscription_error', () => {
        cleanup();
        setFatalError({
          kind: 'join-failed',
          message: 'Não foi possível entrar na sala. Verifique sua conexão e tente novamente.',
        });
        setPhase('fatal-error');
      });

      const pusher = getPusherClient(joinedName, localIdRef.current, roomId, roomSessionRef.current, avatarUrl);
      pusher.connection.bind('state_change', (states: { current: string }) => {
        if (states.current === 'unavailable' || states.current === 'failed') {
          showProblem('Sua conexão com o servidor de sinalização está instável.', true);
        }
      });
    } catch (err) {
      console.error(err);
      cleanup();
      setFatalError({
        kind: 'join-failed',
        message:
          err instanceof Error ? err.message : 'Não foi possível entrar na sala. Tente novamente.',
      });
      setPhase('fatal-error');
    }
  }

  // Refs auxiliares para ler o estado atual dentro de callbacks de eventos do Pusher
  const currentMicRef = useRef(micOn);
  const currentDeafenedRef = useRef(deafened);
  currentDeafenedRef.current = deafened;
  const currentCamRef = useRef(camOn);
  const currentSharingRef = useRef(sharingScreen);
  useEffect(() => {
    currentMicRef.current = micOn;
  }, [micOn]);

  useEffect(() => {
    if (!banner || banner.connection || banner.persistent) return;
    const timer = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(timer);
  }, [banner]);
  useEffect(() => {
    currentCamRef.current = camOn;
  }, [camOn]);
  useEffect(() => {
    currentSharingRef.current = sharingScreen;
  }, [sharingScreen]);

  function appendChatMessage(message: RoomChatMessage) {
    setChatMessages((previous) => [...previous.slice(-199), message]);
    if (!chatOpenRef.current) setChatUnreadCount((count) => Math.min(count + 1, 999));
  }

  function rememberCallAudio(patch: Partial<CallAudioPreference>) {
    const next = { ...audioPreferenceRef.current, ...patch };
    audioPreferenceRef.current = next;
    writeCallAudioPreference(next);
  }

  function showProblem(message: string, connection = false, persistent = false) {
    setBanner({ message, connection, persistent });
  }

  function appendSystemChatMessage(text: string) {
    appendChatMessage({
      id: createChatMessageId(),
      senderId: 'system',
      senderName: 'Sistema',
      text,
      sentAt: Date.now(),
      isSystem: true,
    });
  }

  function updateLocalParticipant(patch: Partial<Participant>) {
    setParticipants((prev) => {
      const local = prev[localIdRef.current];
      if (!local) return prev;
      return { ...prev, [localIdRef.current]: { ...local, ...patch } };
    });
  }

  async function applyHostMicState(muted: boolean) {
    micLockedByHostRef.current = muted;
    setMicLockedByHost(muted);

    const microphoneTracks = cameraStreamRef.current?.getAudioTracks() ?? [];
    const nextMicOn = !muted && microphoneTracks.length > 0;
    microphoneTracks.forEach((track) => { track.enabled = nextMicOn; });
    currentMicRef.current = nextMicOn;
    setMicOn(nextMicOn);
    updateLocalParticipant({ micOn: nextMicOn });

    const manager = managerRef.current;
    try {
      const micTrack = nextMicOn ? (microphoneTracks[0] ?? null) : null;
      await manager?.replaceAudioTrack(micTrack);
    } catch (error) {
      console.error('Não foi possível aplicar o controle do microfone pelo anfitrião:', error);
      showProblem('O estado do microfone mudou, mas não foi possível atualizar o áudio enviado.');
    }

    if (microphoneTracks.length > 0 || muted) rememberCallAudio({ micOn: nextMicOn });
    manager?.broadcastMediaState({ micOn: nextMicOn, camOn: currentCamRef.current, deafened: currentDeafenedRef.current });
    if (!muted && !microphoneTracks.length) {
      showProblem('O anfitrião liberou seu microfone, mas não há microfone disponível neste dispositivo.');
    }
  }

  const sendSoundboardTrack = useCallback((track: MediaStreamTrack | null) => {
    const next = soundboardSendRef.current
      .catch(() => undefined)
      .then(() => managerRef.current?.replaceSoundboardTrack(track) ?? Promise.resolve());
    soundboardSendRef.current = next.then(() => undefined);
    return next;
  }, []);

  const releaseCallMusic = useCallback(() => {
    musicGenerationRef.current += 1;
    const playback = callMusicRef.current;
    callMusicRef.current = null;
    setCallMusicName(null);
    void sendSoundboardTrack(null);
    void stopCallMusicPlayback(playback);
  }, [sendSoundboardTrack]);

  releaseCallMusicRef.current = releaseCallMusic;

  useEffect(() => {
    const gain = callMusicRef.current?.localGain;
    if (gain) gain.gain.value = deafened ? 0 : 1;
  }, [deafened]);

  const playCallMusic = useCallback(async (file: File) => {
    if (!isPlayableAudioFile(file)) {
      showProblem('Escolha um arquivo de áudio, como mp3, wav ou ogg.');
      return;
    }
    releaseCallMusic();
    const generation = musicGenerationRef.current;
    try {
      const playback = await startCallMusicPlayback(file, !deafened);
      if (musicGenerationRef.current !== generation) {
        void stopCallMusicPlayback(playback);
        return;
      }
      callMusicRef.current = playback;
      playback.audio.addEventListener('ended', () => {
        if (callMusicRef.current?.audio === playback.audio) releaseCallMusic();
      }, { once: true });
      await sendSoundboardTrack(playback.track);
      if (musicGenerationRef.current !== generation) return;
      setCallMusicName(file.name.replace(/\.[^.]+$/, '') || file.name);
    } catch (error) {
      console.error('Não foi possível tocar a música na call:', error);
      releaseCallMusic();
      showProblem('Não foi possível tocar esse arquivo na call.');
    }
  }, [deafened, releaseCallMusic, sendSoundboardTrack]);

  const playSoundboardEffect = useCallback(async (effect: SoundboardEffect) => {
    if (!serverId) return false;
    setPlayingSoundId(effect.id);
    try {
      const sent = await new Promise<boolean>((resolve) => {
        let settled = false;
        let timeout: number | undefined;
        const finish = (result: boolean) => {
          if (settled) return;
          settled = true;
          if (timeout !== undefined) window.clearTimeout(timeout);
          resolve(result);
        };
        timeout = window.setTimeout(() => finish(false), 8000);
        window.dispatchEvent(new CustomEvent("sekai:play-server-sound-effect", {
          detail: { serverId, effect, resolve: finish },
        }));
      });
      if (!sent) return false;
      return sent;
    } catch (error) {
      console.error('Não foi possível enviar o efeito sonoro:', error);
      showProblem(error instanceof Error ? error.message : 'Não foi possível enviar o efeito sonoro.');
      return false;
    } finally {
      window.setTimeout(() => setPlayingSoundId((current) => current === effect.id ? null : current), 900);
    }
  }, [serverId]);

  async function changeCallInput(deviceId: string, profile: VoiceProfile = voiceProfile) {
    if (phase !== 'in-call') return;
    let replacement: MediaStream | null = null;
    try {
      replacement = await openCallInput({
        video: false,
        audioDeviceId: deviceId || undefined,
        processing: profile,
      });
      const nextTrack = replacement.getAudioTracks()[0];
      if (!nextTrack) throw new Error('O dispositivo escolhido não forneceu áudio.');
      nextTrack.enabled = micOn && !deafened && !micLockedByHostRef.current;
      setVoiceInputVolume(nextTrack, inputVolume);
      await managerRef.current?.replaceAudioTrack(nextTrack);

      const current = cameraStreamRef.current;
      const previousAudioTracks = current?.getAudioTracks() ?? [];
      const nextStream = new MediaStream([...(current?.getVideoTracks() ?? []), nextTrack]);
      cameraStreamRef.current = nextStream;
      setParticipants((previous) => {
        const local = previous[localIdRef.current];
        return local ? { ...previous, [localIdRef.current]: { ...local, stream: nextStream } } : previous;
      });
      previousAudioTracks.forEach((track) => { if (track !== nextTrack) releaseCallInputTrack(track); });
      setSelectedInputDeviceId(deviceId || voiceDeviceId(nextTrack) || '');
      setVoiceProfile(profile);
      if (userId) saveVoicePreferences(userId, { inputDeviceId: deviceId || voiceDeviceId(nextTrack) || '', voiceProfile: profile }, false);
      replacement = null; // A faixa agora pertence à sessão da chamada.
    } catch (error) {
      releaseCallInput(replacement);
      console.error('Não foi possível trocar o dispositivo de entrada:', error);
      showProblem(error instanceof Error ? error.message : 'Não foi possível trocar o microfone.');
    }
  }

  changeCallInputRef.current = changeCallInput;
  const selectInputDevice = useCallback((deviceId: string) => {
    if (userId) saveVoicePreferences(userId, { inputDeviceId: deviceId }, false);
    void changeCallInputRef.current(deviceId);
  }, [userId]);
  const selectVoiceProfile = useCallback((profile: VoiceProfile) => {
    if (userId) saveVoicePreferences(userId, { voiceProfile: profile }, false);
    void changeCallInputRef.current(selectedInputDeviceId, profile);
  }, [selectedInputDeviceId, userId]);
  const selectOutputDevice = useCallback((deviceId: string) => {
    setSelectedOutputDeviceId(deviceId);
    if (userId) saveVoicePreferences(userId, { outputDeviceId: deviceId }, false);
  }, [userId]);
  const updateInputVolume = useCallback((volume: number) => {
    const next = Math.max(0, Math.min(2, volume));
    setInputVolume(next);
    if (userId) saveVoicePreferences(userId, { inputVolume: next }, false);
  }, [userId]);
  const updateOutputVolume = useCallback((volume: number) => {
    const next = Math.max(0, Math.min(1, volume));
    setOutputVolume(next);
    if (userId) saveVoicePreferences(userId, { outputVolume: next }, false);
  }, [userId]);

  const toggleMic = useCallback(() => {
    if (micLockedByHostRef.current) {
      showProblem('O anfitrião bloqueou seu microfone. Aguarde ele liberar o áudio.');
      return;
    }
    const tracks = cameraStreamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) {
      showProblem('Nenhum microfone está ativo. Permita o acesso ao microfone e entre novamente na sala.');
      return;
    }

    const next = !micOn;
    currentMicRef.current = next;
    rememberCallAudio({ micOn: next });
    setMicOn(next);
    tracks.forEach((t) => (t.enabled = next));
    updateLocalParticipant({ micOn: next });
    managerRef.current?.broadcastMediaState({ micOn: next, camOn, deafened: currentDeafenedRef.current });
  }, [micOn, camOn]);

  const toggleDeafen = useCallback(() => {
    const next = !deafened;
    rememberCallAudio({ deafened: next, micOn: next ? false : micOn });
    currentDeafenedRef.current = next;
    setDeafened(next);
    updateLocalParticipant({ isDeafened: next });
    if (next && micOn) toggleMic();
    else managerRef.current?.broadcastMediaState({ micOn, camOn, deafened: next });
  }, [deafened, micOn, camOn, toggleMic]);

  useEffect(() => {
    onControlsReady?.({
      toggleMic,
      toggleDeafen,
      toggleCam,
      toggleScreenShare,
      playSoundEffect: playSoundboardEffect,
      audioSettings: { inputDevices, outputDevices, selectedInputDeviceId, selectedOutputDeviceId, inputVolume, outputVolume, voiceProfile, outputDeviceSelectionSupported },
      selectInputDevice,
      selectOutputDevice,
      setInputVolume: updateInputVolume,
      setOutputVolume: updateOutputVolume,
      setVoiceProfile: selectVoiceProfile,
    });
  }, [onControlsReady, toggleMic, toggleDeafen, toggleCam, toggleScreenShare, playSoundboardEffect, inputDevices, outputDevices, selectedInputDeviceId, selectedOutputDeviceId, inputVolume, outputVolume, voiceProfile, outputDeviceSelectionSupported, selectInputDevice, selectOutputDevice, updateInputVolume, updateOutputVolume, selectVoiceProfile]);

  useEffect(() => () => onControlsReady?.(null), [onControlsReady]);

  function toggleCam() {
    if (sharingScreen) return; // câmera fica em segundo plano durante compartilhamento
    const next = !camOn;
    currentCamRef.current = next;
    setCamOn(next);
    cameraStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    updateLocalParticipant({ camOn: next });
    managerRef.current?.broadcastMediaState({ micOn, camOn: next, deafened: currentDeafenedRef.current });
  }

  async function stopScreenShare() {
    // Marque como parado antes de encerrar a faixa: o evento `ended` também é
    // disparado quando a pessoa clica no botão do próprio app.
    if (screenShareOperationRef.current || (!currentSharingRef.current && !screenStreamRef.current)) return;
    screenShareOperationRef.current = true;
    currentSharingRef.current = false;

    const display = screenStreamRef.current;
    screenStreamRef.current = null;
    screenAudioTrackRef.current = null;

    const camTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
    const restoreCam = camBeforeShareRef.current;
    currentCamRef.current = restoreCam;
    if (camTrack) camTrack.enabled = restoreCam;

    try {
      await managerRef.current?.replaceVideoTrack(camTrack, cameraStreamRef.current);
    } catch (err) {
      console.error('Não foi possível restaurar a câmera após compartilhar a tela:', err);
      showProblem('A tela parou de ser compartilhada, mas não foi possível restaurar a câmera.');
    }

    display?.getTracks().forEach((track) => track.stop());

    setSharingScreen(false);
    setCamOn(restoreCam);
    updateLocalParticipant({
      isSharingScreen: false,
      stream: cameraStreamRef.current ?? undefined,
      camOn: restoreCam,
    });
    managerRef.current?.broadcastScreenShareState(false);
    managerRef.current?.broadcastMediaState({ micOn: currentMicRef.current, camOn: restoreCam, deafened: currentDeafenedRef.current });
    setScreenCaptureInfo('');
    screenShareOperationRef.current = false;
  }

  async function toggleScreenShare() {
    const manager = managerRef.current;
    if (!manager) {
      showProblem('Não foi possível iniciar a apresentação porque a conexão com a chamada ainda não está pronta. Aguarde a conexão e tente novamente.', false, true);
      return;
    }
    if (screenShareOperationRef.current) return;

    if (currentSharingRef.current) {
      await stopScreenShare();
      return;
    }
    setGoLiveOpen(true);
  }

  async function confirmGoLive(selection: GoLiveSelection) {
    const manager = managerRef.current;
    if (!manager) {
      setGoLiveOpen(false);
      showProblem('Não foi possível iniciar a apresentação porque a conexão com a chamada foi encerrada. Entre novamente na chamada e tente outra vez.', false, true);
      return;
    }
    if (screenShareOperationRef.current) return;
    screenShareOperationRef.current = true;
    setGoLiveBusy(true);

    try {
      const desktop = window.sekaiDesktop;
      if (selection.sourceId && desktop) desktop.prepareCapture(selection.sourceId, selection.shareAudio);
      const displayOptions = selection.sourceId && desktop
        ? {
          video: getScreenVideoConstraints(screenShareSettings),
          audio: selection.shareAudio,
        }
        : buildDisplayMediaRequest(selection.surface, selection.shareAudio, getScreenVideoConstraints(screenShareSettings));
      const display = await navigator.mediaDevices.getDisplayMedia(displayOptions as unknown as DisplayMediaStreamOptions);
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) {
        display.getTracks().forEach((track) => track.stop());
        setGoLiveOpen(false);
        showProblem('Sua apresentação não foi iniciada: o navegador não forneceu uma faixa de vídeo (código: VideoTrackUnavailable). Verifique a permissão de captura e tente outra tela ou janela.', false, true);
        return;
      }

      screenStreamRef.current = display;
      camBeforeShareRef.current = currentCamRef.current;
      const profile = getScreenVideoProfile(screenShareSettings);
      if (profile) {
        screenTrack.contentHint = profile.maxFramerate >= 60 ? 'motion' : 'detail';
        try {
          await screenTrack.applyConstraints(getScreenVideoConstraints(screenShareSettings));
        } catch (constraintError) {
          // O fluxo continua usando a melhor qualidade que o navegador conseguiu capturar.
          console.warn('O navegador não aceitou todos os limites de captura escolhidos:', constraintError);
        }
      }
      const settings = screenTrack.getSettings();
      const actualCaptureInfo = formatScreenCaptureSettings(settings, screenShareSettings);
      const displaySurface = (settings as MediaTrackSettings & { displaySurface?: string }).displaySurface || selection.surface;
      let displayAudioTrack = selection.shareAudio ? (display.getAudioTracks()[0] ?? null) : null;
      if (displayAudioTrack) await prepareScreenAudioTrack(displayAudioTrack, displaySurface);
      if (displayAudioTrack && displayAudioTrack.readyState !== 'live') displayAudioTrack = null;
      screenAudioTrackRef.current = displayAudioTrack;
      if (selection.shareAudio && !displayAudioTrack) {
        showProblem('A tela vai sem som. No aviso do navegador, marque compartilhar o áudio do sistema.');
      }

      try {
        await manager.replaceVideoTrack(screenTrack, display, profile, displayAudioTrack);
      } catch (err) {
        console.error('Não foi possível enviar o compartilhamento de tela:', err);
        screenAudioTrackRef.current = null;
        display.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        setScreenCaptureInfo('');
        await manager
          .replaceVideoTrack(
            cameraStreamRef.current?.getVideoTracks()[0] ?? null,
            cameraStreamRef.current
          )
          .catch(() => {});
        setGoLiveOpen(false);
        const detail = err && typeof err === 'object' && 'name' in err ? String(err.name) : 'erro de transmissão';
        showProblem(`O PC capturou a tela, mas a chamada não conseguiu enviá-la aos participantes. Verifique a conexão e tente novamente (detalhe: ${detail}).`, false, true);
        return;
      }

      setGoLiveOpen(false);
      currentSharingRef.current = true;
      setSharingScreen(true);
      setScreenCaptureInfo(actualCaptureInfo);
      updateLocalParticipant({ isSharingScreen: true, stream: display, camOn: true });
      manager.broadcastScreenShareState(true);
      // `camOn` também controla se o vídeo remoto é exibido. Durante a
      // apresentação, avise que há vídeo mesmo se a câmera estava desligada.
      manager.broadcastMediaState({ micOn: currentMicRef.current, camOn: true, deafened: currentDeafenedRef.current });

      screenTrack.addEventListener('ended', () => {
        // Use a rotina de parada diretamente para não depender do estado React
        // capturado pela função de clique anterior.
        void stopScreenShare();
      }, { once: true });
      displayAudioTrack?.addEventListener('ended', () => {
        if (screenAudioTrackRef.current?.id !== displayAudioTrack.id) return;
        screenAudioTrackRef.current = null;
        const video = screenStreamRef.current?.getVideoTracks()[0];
        if (video && currentSharingRef.current) {
          void manager.replaceVideoTrack(video, screenStreamRef.current, profile, null).catch(() => {});
        }
        appendSystemChatMessage('O navegador encerrou o áudio compartilhado. A imagem continua.');
      }, { once: true });
    } catch (err) {
      console.error('Não foi possível iniciar a apresentação de tela:', err);
      screenAudioTrackRef.current = null;
      setScreenCaptureInfo('');
      setGoLiveOpen(false);
      showProblem(screenShareFailureMessage(err, Boolean(selection.sourceId)), false, true);
    } finally {
      screenShareOperationRef.current = false;
      setGoLiveBusy(false);
    }
  }

  function handleLeave() {
    cleanup();
    chatOpenRef.current = false;
    onClose();
  }

  function sendChatMessage(text: string, imageUrl?: string): boolean {
    if (!imageUrl && handleModerationCommand(text)) return true;
    const channel = channelRef.current;
    if (!channel || !localIdRef.current) return false;

    const message: RoomChatMessage = {
      id: createChatMessageId(),
      senderId: localIdRef.current,
      senderName: localNameRef.current,
      text: text.trim().slice(0, 500),
      sentAt: Date.now(),
      imageUrl,
    };
    if (!message.text && !message.imageUrl) return false;

    try {
      if (!channel.trigger('client-chat-message', message)) {
        showProblem('Não foi possível enviar a mensagem. Verifique se ainda está conectado à sala.');
        return false;
      }
      appendChatMessage(message);
      return true;
    } catch (error) {
      console.error('Não foi possível enviar a mensagem do chat:', error);
      showProblem('Não foi possível enviar a mensagem.');
      return false;
    }
  }

  function handleModerationCommand(text: string): boolean {
    if (!/^\.(kick|mute|unmute|promote|epstein)\b/i.test(text.trim())) return false;
    if (hostIdRef.current !== localIdRef.current) {
      showCommandFeedback('Só o anfitrião da sala pode usar comandos de moderação.');
      return true;
    }

    const match = /^\.(kick|mute|unmute|promote|epstein)\s+@(.+?)\s*$/i.exec(text.trim());
    if (!match) {
      showCommandFeedback('Formato do comando: .kick @nome, .mute @nome, .unmute @nome ou .promote @nome.');
      return true;
    }

    const action = match[1].toLowerCase() as RoomModerationAction;
    const requestedName = match[2].trim().toLocaleLowerCase('pt-BR');
    const matches = Object.values(participants).filter(
      (participant) => participant.name.trim().toLocaleLowerCase('pt-BR') === requestedName
    );
    if (matches.length === 0) {
      showCommandFeedback(`Não encontrei “@${match[2].trim()}” na sala. Use o nome que aparece na lista de participantes.`);
      return true;
    }
    if (matches.length > 1) {
      showCommandFeedback('Há mais de uma pessoa com esse nome. Peça para alguém usar um nome diferente antes de moderar.');
      return true;
    }

    const target = matches[0];
    if (target.id === hostIdRef.current) {
      showCommandFeedback(action === 'promote'
        ? 'Você já é o anfitrião da sala.'
        : action === 'epstein'
          ? 'Escolha outra pessoa para a brincadeira.'
          : 'O anfitrião não pode remover ou silenciar a própria conta por comando.');
      return true;
    }
    if ((action === 'promote' || action === 'epstein') && !memberJoinTimesRef.current.has(target.id)) {
      showCommandFeedback('Essa pessoa já não está conectada à sala. Atualize a lista e tente novamente.');
      return true;
    }

    const channel = channelRef.current;
    if (!channel) {
      showCommandFeedback('A sala ainda está conectando. Tente o comando novamente em instantes.');
      return true;
    }

    const moderation: RoomModerationEvent = { action, targetId: target.id, targetName: target.name };
    try {
      if (!channel.trigger('client-moderation', moderation)) {
        showCommandFeedback('Não foi possível enviar o comando. Verifique se você ainda está conectado à sala.');
        return true;
      }
      if (action === 'epstein') {
        appendSystemChatMessage(`Pedido de brincadeira enviado para ${target.name}. Os arquivos só serão baixados se a pessoa aceitar.`);
        return true;
      }
      const notice = action === 'kick'
        ? `${target.name} foi removido da sala.`
        : action === 'mute'
          ? `${target.name} foi silenciado pelo anfitrião.`
          : action === 'unmute'
            ? `${target.name} teve o microfone liberado pelo anfitrião.`
            : `${target.name} agora é o anfitrião da sala.`;
      appendSystemChatMessage(notice);
      if (action === 'promote') updateHost(target.id);
    } catch (error) {
      console.error('Não foi possível executar o comando de moderação:', error);
      showCommandFeedback('Não foi possível enviar o comando de moderação. Tente novamente.');
    }
    return true;
  }

  function showCommandFeedback(message: string) {
    appendSystemChatMessage(message);
  }

  function acceptPrankDownload() {
    if (!pendingPrankPrompt) return;

    const fileUrl = URL.createObjectURL(new Blob([], { type: 'text/plain;charset=utf-8' }));
    for (let index = 0; index < 10; index += 1) {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = 'eptein.txt';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 30_000);
    setPendingPrankPrompt(null);
    appendSystemChatMessage('Brincadeira aceita: o navegador iniciou o download dos arquivos vazios.');
  }

  async function sendChatImage(file: File) {
    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const extension = extensionByType[file.type];
    if (!extension) throw new Error('Formato de imagem não aceito.');
    if (!localIdRef.current) throw new Error('Entre na sala antes de enviar uma imagem.');

    const uniqueName = createChatMessageId();
    const blob = await uploadPresigned(`chat/${roomId}/${uniqueName}.${extension}`, file, {
      access: 'public',
      contentType: file.type,
      handleUploadUrl: '/api/chat-images/upload',
      clientPayload: JSON.stringify({ roomId, userId: localIdRef.current, sessionToken: roomSessionRef.current }),
    });
    if (!sendChatMessage('', blob.url)) {
      throw new Error('A imagem foi carregada, mas não pôde ser enviada para a sala.');
    }
  }

  function toggleChatPanel() {
    const next = !chatOpenRef.current;
    chatOpenRef.current = next;
    setShowChat(next);
    if (next) {
      setChatUnreadCount(0);
      setShowParticipants(false);
    }
  }

  function toggleParticipantsPanel() {
    setShowParticipants((open) => !open);
    setShowChat(false);
    chatOpenRef.current = false;
  }

  function selectParticipant(participantId: string) {
    const isUnfocusing = focusedParticipantId === participantId;
    setFocusedParticipantId(isUnfocusing ? null : participantId);
    if (!isUnfocusing) setHideOtherParticipants(false);
    setShowChat(false);
    chatOpenRef.current = false;
    setShowParticipants(false);
  }

  function revealScreenShare(participantId: string) {
    setRevealedScreenShareIds((current) => {
      if (current.has(participantId)) return current;
      const next = new Set(current);
      next.add(participantId);
      return next;
    });
    setFocusedParticipantId(participantId);
    setHideOtherParticipants(false);
    setShowChat(false);
    chatOpenRef.current = false;
    setShowParticipants(false);
  }

  function toggleCallFullscreen() {
    onToggleCallFullscreen?.();
  }

  function stopWatchingPresentation() {
    const selected = focusedParticipantId;
    if (selected) {
      setRevealedScreenShareIds((current) => {
        if (!current.has(selected)) return current;
        const next = new Set(current);
        next.delete(selected);
        return next;
      });
    }
    setFocusedParticipantId(null);
  }

  async function minimizeCall() {
    if (watchingPresentation && !presentationPipWindow) {
      const pipApi = (window as WindowWithDocumentPictureInPicture).documentPictureInPicture;
      if (pipApi?.requestWindow) {
        try {
          // requestWindow precisa acontecer durante o clique de minimizar.
          const pipWindow = await pipApi.requestWindow({ width: 360, height: 240 });
          pipWindow.document.title = `Apresentação de ${focusedParticipant?.name ?? roomName}`;
          pipWindow.document.documentElement.style.height = '100%';
          pipWindow.document.body.style.cssText = 'margin:0;min-width:100%;min-height:100%;overflow:hidden;background:#111214;';
          for (const source of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
            const stylesheet = source.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
            if (stylesheet.tagName === 'LINK') {
              const href = stylesheet.getAttribute('href');
              if (href) (stylesheet as HTMLLinkElement).href = new URL(href, document.baseURI).href;
            }
            pipWindow.document.head.appendChild(stylesheet);
          }
          setPresentationPipWindow(pipWindow);
        } catch (error) {
          // Se o navegador não conseguir abrir a janela flutuante, a miniatura
          // continua no Sekai e ainda pode ser arrastada para qualquer canto.
          console.info('Picture-in-Picture de documento indisponível:', error);
        }
      }
    }
    onMinimize?.();
  }

  function restoreCallFromMiniPreview() {
    if (presentationPipWindow && !presentationPipWindow.closed) presentationPipWindow.close();
    setPresentationPipWindow(null);
    onRestoreCall?.();
  }

  function stopWatchingFromMiniPreview() {
    if (presentationPipWindow && !presentationPipWindow.closed) presentationPipWindow.close();
    setPresentationPipWindow(null);
    stopWatchingPresentation();
  }

  async function handleCopyLink() {
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('server_id')
      .eq('id', roomId)
      .eq('type', 'voice')
      .maybeSingle();
    if (channelError || !channel) {
      showProblem('Não foi possível localizar o servidor deste canal.');
      return;
    }

    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .insert({ server_id: channel.server_id, channel_id: roomId, inviter_id: localIdRef.current, max_uses: 0, max_age: 0 })
      .select('code')
      .single();
    if (inviteError || !invite) {
      showProblem('Você não tem permissão para criar um convite ou falta aplicar a migração do Supabase.');
      return;
    }

    const url = inviteUrl(invite.code);
    try {
      await navigator.clipboard.writeText(url);
      appendSystemChatMessage('Convite copiado.');
    } catch {
      appendSystemChatMessage(`Convite criado: ${url}`);
    }
  }

  // Entrada com um clique: pega o microfone (e a câmera, se existir), deixa a câmera
  // desligada e entra na sala. Se o navegador negar, cai na tela de pré-visualização.
  useEffect(() => {
    if (!autoJoin) return;
    let cancelled = false;

    async function start() {
      const preferences = readVoicePreferences(userId ?? '');
      setSelectedInputDeviceId(preferences.inputDeviceId);
      setSelectedOutputDeviceId(preferences.outputDeviceId);
      setInputVolume(preferences.inputVolume);
      setOutputVolume(preferences.outputVolume);
      setVoiceProfile(preferences.voiceProfile);
      const stream = await openCallInput({
        video: true,
        audioDeviceId: preferences.inputDeviceId || undefined,
        processing: preferences.voiceProfile,
      }).catch(() => null);

      if (cancelled) {
        releaseCallInput(stream);
        return;
      }
      if (!stream) {
        setAutoJoining(false);
        return;
      }

      const preference = readCallAudioPreference();
      const micEnabled = microphoneEnabledOnJoin(stream.getAudioTracks().length > 0, preference);
      stream.getVideoTracks().forEach((track) => (track.enabled = false));
      stream.getAudioTracks().forEach((track) => {
        track.enabled = micEnabled;
        setVoiceInputVolume(track, preferences.inputVolume);
      });
      setAutoJoining(false);
      await handleJoin({
        name: initialName,
        stream,
        camOn: false,
        micOn: micEnabled,
      });
    }

    void start();
    return () => {
      cancelled = true;
    };
    // Só na montagem: a sessão é recriada pelo `key` quando o canal muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const participantList = Object.values(participants).map((participant) => participant.isLocal ? { ...participant, isSpeaking: localSpeaking } : participant);
  const focusedParticipant = participantList.find((participant) => participant.id === focusedParticipantId);
  const watchingPresentation = Boolean(
    focusedParticipant && !focusedParticipant.isLocal && focusedParticipant.isSharingScreen && revealedScreenShareIds.has(focusedParticipant.id)
  );
  const isHost = Boolean(localIdRef.current) && hostId === localIdRef.current;

  useEffect(() => {
    if (!presentationPipWindow) return;
    const pipWindow = presentationPipWindow;
    const handlePageHide = () => {
      setPresentationPipWindow((current) => current === pipWindow ? null : current);
    };
    pipWindow.addEventListener('pagehide', handlePageHide, { once: true });
    return () => {
      pipWindow.removeEventListener('pagehide', handlePageHide);
      if (!pipWindow.closed) pipWindow.close();
    };
  }, [presentationPipWindow]);

  useEffect(() => {
    if (!presentationPipWindow || (!callVisible && watchingPresentation && phase === 'in-call')) return;
    if (!presentationPipWindow.closed) presentationPipWindow.close();
    setPresentationPipWindow(null);
  }, [callVisible, phase, presentationPipWindow, watchingPresentation]);

  if (phase === 'pre-join' && autoJoining) {
    return (
      <main className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="animate-fadeIn text-white/60">Entrando na chamada…</p>
      </main>
    );
  }

  if (phase === 'pre-join') {
    const savedVoicePreferences = readVoicePreferences(userId ?? '');
    return <PreJoin roomId={roomName} initialName={initialName} inputDeviceId={savedVoicePreferences.inputDeviceId} voiceProfile={savedVoicePreferences.voiceProfile} onCancel={onClose} onJoin={handleJoin} />;
  }

  if (phase === 'fatal-error') {
    return (
      <main className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 px-6">
        <ErrorBanner
          title="Não foi possível entrar na sala"
          message={fatalError?.message ?? 'Tente novamente em instantes.'}
          onRetry={() => {
            setFatalError(null);
            setAutoJoining(false);
            setPhase('pre-join');
          }}
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-surface-border px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-surface-card"
        >
          Sair da chamada
        </button>
      </main>
    );
  }

  if (phase === 'left') {
    return (
      <main className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <h1 className="text-2xl font-bold">Você saiu da sala</h1>
        <p className="text-white/60 max-w-sm">
          Você pode voltar a qualquer momento usando o mesmo link, enquanto outras pessoas
          continuarem nela.
        </p>
        <div className="flex gap-3">
          <Link
            href={`/sala/${roomId}`}
            className="rounded-xl bg-theme-gradient transition hover:brightness-110 px-5 py-3 font-semibold text-white"
          >
            Entrar novamente
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-surface-card hover:bg-surface-border border border-surface-border transition-colors px-5 py-3 font-semibold text-white"
          >
            Página inicial
          </Link>
        </div>
      </main>
    );
  }

  if (phase === 'kicked') {
    return (
      <main className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <h1 className="text-2xl font-bold">Você foi removido da sala</h1>
        <p className="max-w-sm text-white/60">O anfitrião encerrou sua participação nesta chamada.</p>
        <button type="button" onClick={onClose} className="rounded-xl bg-theme-gradient px-5 py-3 font-semibold text-white transition hover:brightness-110">
          Voltar ao Sekai
        </button>
      </main>
    );
  }

  const isConnecting = phase === 'connecting';

  return (
    <main
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-transparent"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#111214]/70 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 text-sm text-white/60">
          <span className="h-2 w-2 shrink-0 rounded-full bg-success animate-speaking" />
          <span className="truncate font-medium text-white/85">{roomName}</span>
          <span className="hidden text-white/30 sm:inline">·</span>
          <span className="hidden text-xs text-white/45 sm:inline">Chamada de voz</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemePicker placement="down" align="right" />
          {onMinimize && (
            <button
              type="button"
              onClick={() => { void minimizeCall(); }}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-surface-card hover:text-white"
            >
              Minimizar
            </button>
          )}
        </div>
      </header>

      {pendingPrankPrompt && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="prank-download-title"
            className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-5 text-white shadow-2xl"
          >
            <h2 id="prank-download-title" className="text-lg font-semibold">Uma brincadeira da chamada</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              {pendingPrankPrompt.senderName} quer enviar 10 arquivos de texto vazios chamados <code>eptein.txt</code>.
              Nada será baixado sem sua confirmação.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingPrankPrompt(null)}
                className="rounded-xl border border-surface-border px-4 py-2 text-sm text-white/75 transition hover:bg-surface-soft"
              >
                Recusar
              </button>
              <button
                type="button"
                onClick={acceptPrankDownload}
                className="rounded-xl bg-theme-gradient px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Aceitar download
              </button>
            </div>
          </section>
        </div>
      )}

      {banner && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[130] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2">
          <div className="pointer-events-auto max-w-xl mx-auto">
            <ErrorBanner
              title={banner.connection ? "Aviso de conexão" : banner.persistent ? "Falha no compartilhamento de tela" : "Aviso"}
              message={banner.message}
              tone={banner.connection || banner.persistent ? "danger" : "neutral"}
              actionLabel="Fechar"
              onRetry={() => setBanner(null)}
            />
          </div>
        </div>
      )}

      <section className="relative flex min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-hidden px-3 py-4 sm:px-6">
        {isConnecting ? (
          <div className="flex h-full w-full flex-1 items-center justify-center">
            <p className="text-white/60 animate-fadeIn">Conectando à sala…</p>
          </div>
        ) : participantList.length === 0 && !focusedParticipantId ? (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center bg-[#111214] px-4 text-center">
            <h1 className="max-w-[min(80vw,640px)] break-words text-xl font-semibold tracking-tight text-white/75 sm:text-2xl">{roomName}</h1>
          </div>
        ) : (
          <ParticipantsGrid
            participants={participantList}
            mutedSoundEffectUserIds={mutedSoundEffectUserIds}
            muteRemoteAudio={deafened}
            outputDeviceId={selectedOutputDeviceId}
            masterOutputVolume={outputVolume}
            focusedParticipantId={focusedParticipantId}
            revealedScreenShareIds={revealedScreenShareIds}
            onRevealScreenShare={revealScreenShare}
            onSelectParticipant={selectParticipant}
            hideOtherParticipants={hideOtherParticipants}
            onToggleOtherParticipants={() => setHideOtherParticipants((hidden) => !hidden)}
            onToggleFullscreen={toggleCallFullscreen}
            fullscreenActive={callFullscreen}
          />
        )}
      </section>

      <footer className="z-20 flex w-full shrink-0 justify-center bg-transparent px-3 pb-4 pt-2 sm:pb-5">
        <Controls
          micOn={micOn}
          deafened={deafened}
          camOn={camOn}
          sharingScreen={sharingScreen}
          watchingPresentation={watchingPresentation}
          participantCount={participantList.length}
          chatUnreadCount={chatUnreadCount}
          micLockedByHost={micLockedByHost}
          soundEffects={soundEffects}
          soundEffectsLoading={soundEffectsLoading}
          playingSoundId={playingSoundId}
          callMusicName={callMusicName}
          onPlayCallMusic={(file) => { void playCallMusic(file); }}
          onStopCallMusic={releaseCallMusic}
          onPlaySoundEffect={(effect) => { void playSoundboardEffect(effect); }}
          inputDevices={inputDevices}
          outputDevices={outputDevices}
          selectedInputDeviceId={selectedInputDeviceId}
          selectedOutputDeviceId={selectedOutputDeviceId}
          onSelectInputDevice={selectInputDevice}
          onSelectOutputDevice={selectOutputDevice}
          inputVolume={inputVolume}
          outputVolume={outputVolume}
          onInputVolumeChange={updateInputVolume}
          onOutputVolumeChange={updateOutputVolume}
          voiceProfile={voiceProfile}
          onVoiceProfileChange={selectVoiceProfile}
          outputDeviceSelectionSupported={outputDeviceSelectionSupported}
          onToggleMic={toggleMic}
          onToggleDeafen={toggleDeafen}
          onToggleCam={toggleCam}
          onToggleScreenShare={toggleScreenShare}
          onLeave={handleLeave}
          onStopWatching={stopWatchingPresentation}
          onCopyLink={handleCopyLink}
          onToggleParticipants={toggleParticipantsPanel}
          onToggleChat={toggleChatPanel}
        />
        <p className="sr-only" aria-live="polite">{sharingScreen && screenCaptureInfo ? `Transmitindo tela: ${screenCaptureInfo}.` : ""}</p>
      </footer>

      {goLiveOpen && (
        <GoLivePicker
          settings={screenShareSettings}
          busy={goLiveBusy}
          onSettingsChange={setScreenShareSettings}
          onCancel={() => { if (!goLiveBusy) setGoLiveOpen(false); }}
          onConfirm={(selection) => { void confirmGoLive(selection); }}
        />
      )}
      {showParticipants && (
        <ParticipantsPanel participants={participantList} onClose={() => setShowParticipants(false)} onAddFriend={onAddFriend} />
      )}
      {showChat && (
        <ChatPanel
          messages={chatMessages}
          currentUserId={localIdRef.current}
          isHost={isHost}
          hostName={participants[hostId]?.name ?? ''}
          onClose={toggleChatPanel}
          onSend={sendChatMessage}
          onSendImage={sendChatImage}
        />
      )}
      {!callVisible && watchingPresentation && focusedParticipant && typeof document !== 'undefined' && createPortal(
        <PresentationMiniPreview
          participant={focusedParticipant}
          onOpen={restoreCallFromMiniPreview}
          onStopWatching={stopWatchingFromMiniPreview}
        />,
        presentationPipWindow && !presentationPipWindow.closed ? presentationPipWindow.document.body : document.body
      )}
    </main>
  );
}

function getScreenVideoConstraints(settings: ScreenShareSettings): MediaTrackConstraints {
  const width = Math.round(settings.height * 16 / 9);
  return {
    width: { ideal: width, max: width },
    height: { ideal: settings.height, max: settings.height },
    frameRate: { ideal: settings.frameRate, max: settings.frameRate },
  };
}

function getScreenVideoProfile(settings: ScreenShareSettings): VideoSenderProfile & { width: number; height: number } {
  const width = Math.round(settings.height * 16 / 9);
  const pixelRate = width * settings.height * settings.frameRate;
  const referencePixelRate = 1920 * 1080 * 60;
  // Limite agregado para a malha P2P. Cada nova pessoa divide essa banda; um
  // navegador ou conexão mais fracos ainda podem entregar menos que o pedido.
  const totalBitrate = Math.min(24_000_000, Math.max(1_000_000, Math.round(pixelRate / referencePixelRate * 6_000_000)));
  return {
    width,
    height: settings.height,
    maxFramerate: settings.frameRate,
    maxBitrate: totalBitrate,
    totalBitrate,
  };
}

function formatScreenCaptureSettings(settings: MediaTrackSettings, requested: ScreenShareSettings) {
  const profile = getScreenVideoProfile(requested);
  const dimensions = settings.width && settings.height
    ? `${settings.width} × ${settings.height}`
    : `${profile.width} × ${profile.height} (solicitado)`;
  const frameRate = settings.frameRate ? `${Math.round(settings.frameRate)} fps` : `${profile.maxFramerate} fps (solicitado)`;
  return `${dimensions} · ${frameRate}`;
}

async function fetchIceServers(accessToken: string): Promise<IceServerConfig[]> {
  try {
    const res = await fetch('/api/turn-credentials', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    if (!res.ok) return [{ urls: 'stun:stun.l.google.com:19302' }];
    const data = await res.json();
    return data.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

function createRemoteParticipant(id: string, name = 'Convidado', avatarUrl?: string | null, joinedAt = Date.now()): Participant {
  return {
    id,
    name,
    joinedAt,
    avatarUrl,
    micOn: true,
    isDeafened: false,
    camOn: true,
    isSpeaking: false,
    isSharingScreen: false,
    isLocal: false,
    connectionState: 'connecting',
  };
}

function getPusherEventUserId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const userId = (metadata as { user_id?: unknown }).user_id;
  return typeof userId === 'string' && userId.length <= 100 ? userId : null;
}

function createChatMessageId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function normalizeChatMessage(
  payload: unknown,
  trustedSenderId: string | null,
  trustedSenderName?: string
): RoomChatMessage | null {
  if (!payload || typeof payload !== 'object' || !trustedSenderId) return null;
  const candidate = payload as Partial<RoomChatMessage>;
  const text = typeof candidate.text === 'string' ? candidate.text.trim().slice(0, 500) : '';
  let imageUrl: string | undefined;
  if (typeof candidate.imageUrl === 'string') {
    try {
      const parsed = new URL(candidate.imageUrl);
      if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.blob.vercel-storage.com')) {
        imageUrl = parsed.toString();
      }
    } catch {
      // Ignora endereços que não são URLs válidas.
    }
  }
  if (!text && !imageUrl) return null;

  const sentAt = typeof candidate.sentAt === 'number' && Number.isFinite(candidate.sentAt)
      && Math.abs(candidate.sentAt) <= 8_640_000_000_000_000
    ? candidate.sentAt
    : Date.now();

  return {
    id: typeof candidate.id === 'string' ? candidate.id.slice(0, 100) : `${trustedSenderId}-${sentAt}`,
    senderId: trustedSenderId,
    senderName: trustedSenderName?.trim().slice(0, 40) || 'Convidado',
    text,
    sentAt,
    imageUrl,
    isSystem: false,
  };
}

function normalizeModerationEvent(payload: unknown): RoomModerationEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<RoomModerationEvent>;
  if (
    candidate.action !== 'kick' && candidate.action !== 'mute' && candidate.action !== 'unmute' && candidate.action !== 'promote' && candidate.action !== 'epstein'
  ) return null;
  if (typeof candidate.targetId !== 'string' || candidate.targetId.length > 100) return null;
  return {
    action: candidate.action,
    targetId: candidate.targetId,
    targetName: typeof candidate.targetName === 'string' ? candidate.targetName.trim().slice(0, 40) || 'Participante' : 'Participante',
  };
}

