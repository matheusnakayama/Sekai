export type UiSound = "message" | "mention" | "call-join" | "call-leave" | "call-ring";

const MESSAGE_SOUNDS = new Set<UiSound>(["message", "mention"]);

let presence = "online";
let outputVolume = 1;
let outputDeviceId = "";
let context: AudioContext | null = null;
const lastPlayed = new Map<UiSound, number>();

export function shouldPlayUiSound(kind: UiSound, currentPresence: string | null | undefined, volume = 1) {
  if (!Number.isFinite(volume) || volume <= 0) return false;
  if (MESSAGE_SOUNDS.has(kind) && currentPresence === "dnd") return false;
  return true;
}

export function setUiSoundPresence(next: string | null | undefined) {
  presence = next || "online";
}

export function setUiSoundOutput(volume: number, deviceId = "") {
  outputVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
  outputDeviceId = deviceId;
  const current = context as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
  if (current?.setSinkId && outputDeviceId) {
    void current.setSinkId(outputDeviceId).catch(() => {});
  }
}

export function unlockUiSounds() {
  if (typeof window === "undefined") return;
  const current = ensureContext();
  if (current?.state === "suspended") void current.resume().catch(() => {});
}

function ensureContext() {
  if (typeof window === "undefined") return null;
  if (!context) {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    setUiSoundOutput(outputVolume, outputDeviceId);
  }
  return context;
}

function tone(
  ctx: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  type: OscillatorType,
  peak: number,
  slideTo?: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const master = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(40, frequency), start);
  if (slideTo && slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + Math.min(0.02, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  master.gain.value = outputVolume;
  osc.connect(gain);
  gain.connect(master);
  master.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function playCue(ctx: AudioContext, kind: UiSound) {
  const now = ctx.currentTime + 0.01;
  const level = 0.16;
  if (kind === "message") {
    tone(ctx, now, 880, 0.11, "sine", level);
    tone(ctx, now + 0.045, 1318, 0.14, "sine", level * 0.72);
    return;
  }
  if (kind === "mention") {
    tone(ctx, now, 988, 0.09, "triangle", level);
    tone(ctx, now + 0.07, 1318, 0.1, "triangle", level * 0.85);
    tone(ctx, now + 0.14, 1760, 0.16, "sine", level * 0.7);
    return;
  }
  if (kind === "call-join") {
    tone(ctx, now, 466, 0.2, "sine", level * 0.9, 784);
    tone(ctx, now + 0.12, 988, 0.12, "triangle", level * 0.45);
    return;
  }
  if (kind === "call-leave") {
    tone(ctx, now, 698, 0.22, "sine", level * 0.8, 349);
    tone(ctx, now + 0.04, 440, 0.12, "triangle", level * 0.3);
    return;
  }
  tone(ctx, now, 740, 0.1, "sine", level, 988);
  tone(ctx, now + 0.16, 740, 0.12, "sine", level * 0.85, 1174);
}

export function playUiSound(kind: UiSound) {
  if (!shouldPlayUiSound(kind, presence, outputVolume)) return;
  const now = Date.now();
  const previous = lastPlayed.get(kind) ?? 0;
  if (now - previous < 90) return;
  lastPlayed.set(kind, now);
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      if (ctx.state === "running") playCue(ctx, kind);
    }).catch(() => {});
    return;
  }
  playCue(ctx, kind);
}
