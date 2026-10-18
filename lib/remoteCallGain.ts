import { connectSpeechCleaner, type SpeechCleanerHandle } from "@/lib/speechCleaner";
import { SPEECH_SAMPLE_RATE } from "@/lib/speechCleanup";

type VoiceGraph = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
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
  const graph: VoiceGraph = { context, source, gain, stopClean: null, mode: "idle", gainLinked: false, generation: 0 };
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

/**
 * Até 100%, sem limpeza, o elemento segue no caminho normal.
 * A voz remota sempre passa pelo filtro. Acima de 100% o ganho leva até 200%.
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

  graph.gain.gain.value = level;
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
      cleaner = await connectSpeechCleaner(graph.context, graph.source, graph.gain, "full");
      if (graph.generation !== generation) {
        cleaner.stop();
        return;
      }
      graph.stopClean = cleaner.stop;
      graph.mode = "clean";
    } else {
      graph.source.connect(graph.gain);
      graph.mode = "direct";
    }
    linkGain(graph);
    audio.volume = 1;
    graph.gain.gain.value = level;
  });
}

/** Solta o filtro quando o participante sai, e guarda a fonte para o mesmo elemento voltar. */
export function releaseRemoteVoiceGain(audio: HTMLMediaElement) {
  const graph = graphs.get(audio);
  if (!graph) return;
  graph.generation += 1;
  graph.stopClean?.();
  graph.stopClean = null;
  try { graph.source.disconnect(); } catch { /* A fonte já estava solta. */ }
  if (graph.gainLinked) {
    try { graph.gain.disconnect(); } catch { /* O ganho já estava solto. */ }
    graph.gainLinked = false;
  }
  graph.mode = "idle";
}
