export type CallAudioPreference = { micOn: boolean; deafened: boolean };

const STORAGE_KEY = "sekai-call-audio";

export const DEFAULT_CALL_AUDIO: CallAudioPreference = { micOn: true, deafened: false };

export function readCallAudioPreference(): CallAudioPreference {
  if (typeof window === "undefined") return DEFAULT_CALL_AUDIO;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      micOn: value?.micOn !== false,
      deafened: value?.deafened === true,
    };
  } catch {
    return DEFAULT_CALL_AUDIO;
  }
}

export function writeCallAudioPreference(preference: CallAudioPreference) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    micOn: preference.micOn,
    deafened: preference.deafened,
  }));
}

export function microphoneEnabledOnJoin(hasMicrophone: boolean, preference: CallAudioPreference) {
  return hasMicrophone && preference.micOn && !preference.deafened;
}
