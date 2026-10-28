import { configureVoiceLimiter, connectSpeechCleaner, createSpeechLeveler, setSpeechLevelerPreference, type SpeechCleanerHandle } from "@/lib/speechCleaner";
import { LEVELER_FALLBACK_GAIN, SPEECH_SAMPLE_RATE } from "@/lib/speechCleanup";

type VoiceGraph = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  boost: GainNode | null;
  limiter: DynamicsCompressorNode | null;
  leveler: AudioWorkletNode | null;
  stopClean: (() => void) | null;
  mode: "idle" | "direct" | "clean";
  gainLinked: boolean;
  generation: number;
};

const graphs = new WeakMap<HTMLMediaElement, VoiceGraph>();
const tails = new WeakMap<HTMLMediaElement, Promise<void>>();
let sharedContext: AudioContext | null = null;
let resumeHooked = false;

export type RemoteVoiceOptions = {
  /** Limpa a voz de quem fala. Efeitos e o áudio da tela não entram aqui. */
  clean?: boolean;
};

function audioContext() {
  if (!sharedContext || sharedContext.state === "closed") {
    const Ctor = window.AudioContext;
    try {
      sharedContext = new Ctor({ latencyHint: "interactive", sampleRate: SPEECH_SAMPLE_RATE });
    } catch {
      sharedContext = new Ctor({ latencyHint: "interactive" });
    }
    if (!resumeHooked) {
      resumeHooked = true;
      const resume = () => {
        if (sharedContext?.state === "suspended") void sharedContext.resume().catch(() => undefined);
      };
      window.addEventListener("pointerdown", resume);
    }
  }
  return sharedContext;
}

function enqueue(audio: HTMLMediaElement, task: () => Promise<void> | void) {
  const previous = tails.get(audio) ?? Promise.resolve();
  const run = previous.then(task, task);
  tails.set(audio, run.then(() => undefined, () => undefined));
  return run;
}

function ensureGraph(audio: HTMLMediaElement) {
  const existing = graphs.get(audio);
  if (existing) return existing;
  const context = audioContext();
  const source = context.createMediaElementSource(audio);
  const gain = context.createGain();
  const graph: VoiceGraph = { context, source, gain, boost: null, limiter: null, leveler: null, stopClean: null, mode: "idle", gainLinked: false, generation: 0 };
  graphs.set(audio, graph);
  return graph;
}

async function routeOutput(context: AudioContext, outputDeviceId: string) {
  if (context.state === "suspended") await context.resume().catch(() => undefined);
  const sink = context as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (typeof sink.setSinkId !== "function") return;
  try { await sink.setSinkId(outputDeviceId || "default"); } catch { /* A saída padrão continua valendo. */ }
}

function linkGain(graph: VoiceGraph) {
  if (graph.gainLinked) return;
  graph.gain.connect(graph.context.destination);
  graph.gainLinked = true;
}

function applyLevel(graph: VoiceGraph, level: number) {
  if (graph.leveler) {
    setSpeechLevelerPreference(graph.leveler, level);
    graph.gain.gain.value = level === 0 ? 0 : 1;
    return;
  }
  if (graph.boost) {
    graph.boost.gain.value = level * LEVELER_FALLBACK_GAIN;
    graph.gain.gain.value = level === 0 ? 0 : 1;
    return;
  }
  graph.gain.gain.value = level;
}

/**
 * A voz remota é nivelada até um volume de conversa. 100% é esse alvo.
 * 200% deixa a fala mais alta, e quem chega muito baixo sobe além do teto antigo.
 */
export function applyRemoteVoiceGain(audio: HTMLMediaElement, linear: number, outputDeviceId = "", options: RemoteVoiceOptions = {}) {
  const level = Math.max(0, Math.min(2, Number.isFinite(linear) ? linear : 1));
  const clean = options.clean === true;
  const existing = graphs.get(audio);
  if (!existing && !clean && level <= 1) {
    audio.volume = level;
    return Promise.resolve();
  }

  let graph: VoiceGraph;
  try {
    graph = ensureGraph(audio);
  } catch {
    audio.volume = Math.min(1, level);
    return Promise.resolve();
  }

  applyLevel(graph, level);
  if (graph.mode !== "idle") audio.volume = 1;
  const wants = clean ? "clean" : graph.mode === "clean" ? "clean" : "direct";
  if (graph.mode === wants) {
    return enqueue(audio, () => routeOutput(graph.context, outputDeviceId));
  }

  const generation = ++graph.generation;
  return enqueue(audio, async () => {
    if (graph.generation !== generation) return;
    await routeOutput(graph.context, outputDeviceId);
    if (graph.generation !== generation) return;
    graph.stopClean?.();
    graph.stopClean = null;
    try { graph.source.disconnect(); } catch { /* A fonte ainda não tinha saída. */ }
    let cleaner: SpeechCleanerHandle | null = null;
    if (clean) {
      const limiter = graph.context.createDynamicsCompressor();
      configureVoiceLimiter(limiter);
      graph.limiter = limiter;
      const leveler = await createSpeechLeveler(graph.context);
      if (graph.generation !== generation) {
        try { leveler?.disconnect(); } catch { /* O nivelador ainda não entrou na cadeia. */ }
        try { limiter.disconnect(); } catch { /* O limitador ainda não tinha saída. */ }
        graph.leveler = null;
        graph.limiter = null;
        return;
      }
      if (leveler) {
        graph.leveler = leveler;
        cleaner = await connectSpeechCleaner(graph.context, graph.source, leveler, "full");
        leveler.connect(limiter);
      } else {
        const boost = graph.context.createGain();
        graph.boost = boost;
        cleaner = await connectSpeechCleaner(graph.context, graph.source, boost, "full");
        boost.connect(limiter);
      }
      if (graph.generation !== generation) {
        cleaner.stop();
        try { leveler?.disconnect(); } catch { /* O nivelador já foi solto. */ }
        try { graph.boost?.disconnect(); } catch { /* O ganho de reserva já foi solto. */ }
        try { limiter.disconnect(); } catch { /* O limitador já foi solto. */ }
        graph.leveler = null;
        graph.boost = null;
        graph.limiter = null;
        return;
      }
      limiter.connect(graph.gain);
      graph.stopClean = cleaner.stop;
      graph.mode = "clean";
    } else {
      graph.source.connect(graph.gain);
      graph.mode = "direct";
    }
    linkGain(graph);
    audio.volume = 1;
    applyLevel(graph, level);
  });
}

/** Solta o filtro quando o participante sai, e guarda a fonte para o mesmo elemento voltar. */
export function releaseRemoteVoiceGain(audio: HTMLMediaElement) {
  const graph = graphs.get(audio);
  if (!graph) return;
  graph.generation += 1;
  graph.stopClean?.();
  graph.stopClean = null;
  try { graph.leveler?.disconnect(); } catch { /* O nivelador já estava solto. */ }
  try { graph.boost?.disconnect(); } catch { /* O ganho de reserva já estava solto. */ }
  try { graph.limiter?.disconnect(); } catch { /* O limitador já estava solto. */ }
  graph.leveler = null;
  graph.boost = null;
  graph.limiter = null;
  try { graph.source.disconnect(); } catch { /* A fonte já estava solta. */ }
  if (graph.gainLinked) {
    try { graph.gain.disconnect(); } catch { /* O ganho já estava solto. */ }
    graph.gainLinked = false;
  }
  graph.mode = "idle";
}
