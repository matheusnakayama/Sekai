export type SavedVoiceProfile = "standard" | "noise-suppression";

export interface VoicePreferences {
  inputDeviceId: string;
  outputDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  voiceProfile: SavedVoiceProfile;
}

export const VOICE_PREFERENCES_UPDATED_EVENT = "sekai:voice-preferences-updated";

const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  inputDeviceId: "",
  outputDeviceId: "",
  inputVolume: 1,
  outputVolume: 1,
  voiceProfile: "standard",
};

function storageKey(userId: string) {
  return `sekai-voice-preferences:${userId}`;
}

export function readVoicePreferences(userId: string): VoicePreferences {
  if (typeof window === "undefined" || !userId) return { ...DEFAULT_VOICE_PREFERENCES };
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(userId)) || "null");
    if (!saved || typeof saved !== "object") return { ...DEFAULT_VOICE_PREFERENCES };
    return {
      inputDeviceId: typeof saved.inputDeviceId === "string" ? saved.inputDeviceId : "",
      outputDeviceId: typeof saved.outputDeviceId === "string" ? saved.outputDeviceId : "",
      inputVolume: typeof saved.inputVolume === "number" ? Math.max(0, Math.min(2, saved.inputVolume)) : 1,
      outputVolume: typeof saved.outputVolume === "number" ? Math.max(0, Math.min(1, saved.outputVolume)) : 1,
      voiceProfile: saved.voiceProfile === "noise-suppression" ? "noise-suppression" : "standard",
    };
  } catch {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
}

export function saveVoicePreferences(
  userId: string,
  update: Partial<VoicePreferences>,
  notify = true,
): VoicePreferences {
  const next = { ...readVoicePreferences(userId), ...update };
  next.inputVolume = Math.max(0, Math.min(2, next.inputVolume));
  next.outputVolume = Math.max(0, Math.min(1, next.outputVolume));
  if (typeof window === "undefined" || !userId) return next;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
    if (notify) {
      window.dispatchEvent(new CustomEvent(VOICE_PREFERENCES_UPDATED_EVENT, { detail: { userId, preferences: next } }));
    }
  } catch {
    // Preferências continuam aplicadas na sessão atual mesmo se o storage estiver indisponível.
  }
  return next;
}
