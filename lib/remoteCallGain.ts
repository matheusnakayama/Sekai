type VoiceGraph = {
  context: AudioContext;
  gain: GainNode;
};

const graphs = new WeakMap<HTMLMediaElement, VoiceGraph>();
let sharedContext: AudioContext | null = null;

function audioContext() {
  if (!sharedContext) sharedContext = new AudioContext();
  return sharedContext;
}

/**
 * Até 100% o elemento de áudio segue no caminho normal, para não mexer
 * na saída escolhida nas configurações. Acima disso, um ganho leva o
 * volume até 200%.
 */
export async function applyRemoteVoiceGain(audio: HTMLMediaElement, linear: number, outputDeviceId = "") {
  const level = Math.max(0, Math.min(2, Number.isFinite(linear) ? linear : 1));
  const existing = graphs.get(audio);
  if (level <= 1 && !existing) {
    audio.volume = level;
    return;
  }

  let graph = existing;
  if (!graph) {
    const context = audioContext();
    if (context.state === "suspended") await context.resume();
    const sink = context as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (outputDeviceId && typeof sink.setSinkId === "function") {
      try { await sink.setSinkId(outputDeviceId); } catch { /* A saída padrão continua valendo. */ }
    }
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    source.connect(gain);
    gain.connect(context.destination);
    graph = { context, gain };
    graphs.set(audio, graph);
    audio.volume = 1;
  }
  graph.gain.gain.value = level;
}
