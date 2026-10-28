"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, Play, Square, Volume2 } from "lucide-react";
import { openCallInput, releaseCallInput } from "@/lib/voiceCapture";
import { readVoicePreferences, saveVoicePreferences, type VoicePreferences } from "@/lib/voicePreferences";

interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

type TestSession = {
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  recorder: MediaRecorder;
  chunks: BlobPart[];
  frame: number;
};

const selectClass = "mt-2 w-full rounded-xl border border-white/10 bg-discord-bg-secondary px-3 py-3 text-sm text-discord-text-normal outline-none transition focus:border-discord-brand";
const rangeClass = "mt-3 w-full accent-[rgb(var(--d-brand))]";

export function VoiceSettingsPanel({ userId }: { userId: string }) {
  const [preferences, setPreferences] = useState<VoicePreferences>({ inputDeviceId: "", outputDeviceId: "", inputVolume: 1, outputVolume: 1, voiceProfile: "standard" });
  const [inputDevices, setInputDevices] = useState<AudioDeviceOption[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDeviceOption[]>([]);
  const [canSelectOutput, setCanSelectOutput] = useState(false);
  const [testState, setTestState] = useState<"idle" | "recording" | "playing">("idle");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sessionRef = useRef<TestSession | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setPreferences(readVoicePreferences(userId));
    return () => {
      mountedRef.current = false;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        cancelAnimationFrame(session.frame);
        session.recorder.onstop = null;
        if (session.recorder.state !== "inactive") session.recorder.stop();
        releaseCallInput(session.stream);
        void session.context.close().catch(() => undefined);
      }
      playerRef.current?.pause();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, [userId]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setInputDevices(devices.filter((device) => device.kind === "audioinput").map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microfone ${index + 1}`,
        })));
        setOutputDevices(devices.filter((device) => device.kind === "audiooutput" && device.deviceId !== "default").map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Saída de áudio ${index + 1}`,
        })));
        setCanSelectOutput(typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype);
      } catch {
        // A lista será atualizada novamente depois de uma permissão de microfone.
      }
    };
    void refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", refresh);
    };
  }, []);

  function updatePreferences(update: Partial<VoicePreferences>) {
    const next = saveVoicePreferences(userId, update);
    setPreferences(next);
  }

  function clearRecording() {
    playerRef.current?.pause();
    playerRef.current = null;
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
    setRecordingUrl(null);
  }

  async function playRecording(url: string) {
    playerRef.current?.pause();
    const player = new Audio(url);
    player.volume = preferences.outputVolume;
    playerRef.current = player;
    player.onended = () => {
      if (mountedRef.current) setTestState("idle");
    };
    player.onerror = () => {
      if (mountedRef.current) {
        setTestState("idle");
        setError("Não foi possível reproduzir o teste. Confira a saída de áudio selecionada.");
      }
    };
    if (preferences.outputDeviceId && "setSinkId" in player) {
      try {
        await (player as HTMLAudioElement & { setSinkId: (deviceId: string) => Promise<void> }).setSinkId(preferences.outputDeviceId);
      } catch {
        if (mountedRef.current) setNotice("Não consegui usar essa saída para o teste; vou reproduzir na saída padrão do sistema.");
      }
    }
    if (!mountedRef.current || playerRef.current !== player) {
      player.pause();
      return;
    }
    try {
      await player.play();
      if (!mountedRef.current) return;
      setTestState("playing");
      setNotice("Reproduzindo a gravação do teste.");
    } catch {
      if (!mountedRef.current) return;
      setTestState("idle");
      setError("O navegador bloqueou a reprodução. Tente tocar em Ouvir teste.");
    }
  }

  async function startTest() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador não oferece suporte à gravação de teste de microfone.");
      return;
    }
    clearRecording();
    setError("");
    setNotice("Grave alguns segundos falando. Ao parar, vou reproduzir o áudio para você.");
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext({ latencyHint: "interactive" });
      await context.resume();
      if (!mountedRef.current) {
        await context.close().catch(() => undefined);
        return;
      }
      stream = await openCallInput({
        video: false,
        audioDeviceId: preferences.inputDeviceId || undefined,
        processing: preferences.voiceProfile,
      });
      if (!mountedRef.current) {
        releaseCallInput(stream);
        await context.close().catch(() => undefined);
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      if (mountedRef.current) {
        setInputDevices(devices.filter((device) => device.kind === "audioinput").map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microfone ${index + 1}`,
        })));
        setOutputDevices(devices.filter((device) => device.kind === "audiooutput" && device.deviceId !== "default").map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Saída de áudio ${index + 1}`,
        })));
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const recorder = new MediaRecorder(stream);
      const session: TestSession = { stream, context, analyser, recorder, chunks: [], frame: 0 };
      sessionRef.current = session;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) session.chunks.push(event.data);
      };
      recorder.onerror = () => {
        setError("O navegador não conseguiu gravar o teste de microfone.");
        stopRecording(session, false);
      };
      recorder.onstop = () => {
        if (sessionRef.current !== session) return;
        sessionRef.current = null;
        cancelAnimationFrame(session.frame);
        releaseCallInput(session.stream);
        void session.context.close().catch(() => undefined);
        if (!session.chunks.length) {
          if (mountedRef.current) {
            setTestState("idle");
            setInputLevel(0);
            setError("Não recebi áudio do microfone. Verifique o dispositivo e tente novamente.");
          }
          return;
        }
        const blob = new Blob(session.chunks, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        recordingUrlRef.current = url;
        if (mountedRef.current) {
          setRecordingUrl(url);
          setInputLevel(0);
          setError("");
          void playRecording(url);
        } else {
          URL.revokeObjectURL(url);
        }
      };
      recorder.start();
      setTestState("recording");
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        if (sessionRef.current !== session) return;
        analyser.getByteTimeDomainData(samples);
        let total = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          total += centered * centered;
        }
        const rms = Math.sqrt(total / samples.length);
        setInputLevel(Math.min(1, rms * 5));
        session.frame = requestAnimationFrame(measure);
      };
      measure();
    } catch (cause) {
      releaseCallInput(stream);
      if (context) await context.close().catch(() => undefined);
      if (!mountedRef.current) return;
      setTestState("idle");
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        setError("O acesso ao microfone foi bloqueado. Permita o uso do microfone nas permissões do navegador ou do Windows.");
      } else if (cause instanceof DOMException && cause.name === "NotFoundError") {
        setError("Nenhum microfone disponível. Conecte um dispositivo e tente novamente.");
      } else if (cause instanceof DOMException && cause.name === "NotReadableError") {
        setError("O microfone está sendo usado por outro aplicativo ou não pôde ser aberto.");
      } else {
        setError(cause instanceof Error ? `Não foi possível iniciar o teste: ${cause.message}` : "Não foi possível iniciar o teste do microfone.");
      }
    }
  }

  function stopRecording(session = sessionRef.current, play = true) {
    if (!session || session.recorder.state === "inactive") return;
    if (!play) {
      session.recorder.onstop = null;
      sessionRef.current = null;
      cancelAnimationFrame(session.frame);
      releaseCallInput(session.stream);
      void session.context.close().catch(() => undefined);
      setTestState("idle");
      setInputLevel(0);
      return;
    }
    session.recorder.stop();
    setNotice("Finalizando o teste e reproduzindo sua gravação…");
  }

  function stopPlayback() {
    playerRef.current?.pause();
    setTestState("idle");
    setNotice("Teste finalizado.");
  }

  const activeBars = Math.round(inputLevel * 24);

  return (
    <div className="settings-section-enter">
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-discord-brand">Áudio</p>
        <h2 className="mt-1 text-2xl font-bold text-discord-header-primary">Voz e vídeo</h2>
        <p className="mt-2 text-sm leading-6 text-discord-text-muted">Escolha os dispositivos usados nas chamadas e teste o microfone. Ao encerrar a gravação, você vai ouvir como sua voz foi captada.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
        <label className="block text-sm font-semibold text-discord-text-normal"><span className="flex items-center gap-2"><Mic size={16} className="text-discord-brand"/> Microfone</span>
          <select aria-label="Microfone padrão" value={preferences.inputDeviceId} onChange={(event) => updatePreferences({ inputDeviceId: event.target.value })} className={selectClass}>
            <option value="">Padrão do sistema</option>
            {inputDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
        </label>

        <label className="block text-sm font-semibold text-discord-text-normal"><span className="flex items-center gap-2"><Headphones size={16} className="text-discord-brand"/> Saída de áudio</span>
          <select aria-label="Saída de áudio padrão" value={preferences.outputDeviceId} disabled={!canSelectOutput} onChange={(event) => updatePreferences({ outputDeviceId: event.target.value })} className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-60`}>
            <option value="">Padrão do sistema</option>
            {outputDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
          {!canSelectOutput && <p className="mt-1 text-xs text-discord-text-muted">Este navegador não permite escolher a saída; será usada a saída padrão do sistema.</p>}
        </label>

        <label className="block text-sm font-semibold text-discord-text-normal">Perfil de entrada
          <select aria-label="Perfil de entrada do microfone" value={preferences.voiceProfile} onChange={(event) => updatePreferences({ voiceProfile: event.target.value as VoicePreferences["voiceProfile"] })} className={selectClass}>
            <option value="standard">Padrão</option>
            <option value="noise-suppression">Supressão neural (RNNoise)</option>
            <option value="elevenlabs">Supressão ElevenLabs</option>
          </select>
          <span className="mt-1 block text-xs font-normal leading-5 text-discord-text-muted">{preferences.voiceProfile === "elevenlabs" ? "A voz sai do seu microfone, passa pela isolação da ElevenLabs e segue para a chamada sem o ruído de fundo. Isso acrescenta um pequeno atraso. Se o serviço não responder, o Sekai usa a limpeza local. No servidor, preencha ELEVENLABS_API_KEY." : preferences.voiceProfile === "noise-suppression" ? "Limpa a voz neste aparelho com o RNNoise, corta o ronco grave e abaixa o chiado que sobra. Se o filtro neural não carregar, o corte de graves continua." : "Limpa a voz e nivela quem fala baixo até o volume de uma conversa. 100% é esse nível. 200% deixa mais alto. Quem escuta também sobe a voz que chega baixa."}</span>
        </label>

        <label className="block text-sm font-semibold text-discord-text-normal">Volume de entrada <span className="float-right font-normal text-discord-text-muted">{Math.round(preferences.inputVolume * 100)}%</span>
          <input aria-label="Volume de entrada do microfone" type="range" min="0" max="2" step="0.01" value={preferences.inputVolume} onChange={(event) => updatePreferences({ inputVolume: Number(event.target.value) })} className={rangeClass}/>
        </label>

        <label className="block text-sm font-semibold text-discord-text-normal">Volume de saída <span className="float-right font-normal text-discord-text-muted">{Math.round(preferences.outputVolume * 100)}%</span>
          <input aria-label="Volume de saída" type="range" min="0" max="1" step="0.01" value={preferences.outputVolume} onChange={(event) => updatePreferences({ outputVolume: Number(event.target.value) })} className={rangeClass}/>
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-discord-header-primary">Teste do microfone</h3><p className="mt-1 text-xs leading-5 text-discord-text-muted">Fale durante a gravação. Ao parar, sua voz será reproduzida na saída selecionada.</p></div>
          <div className="flex gap-2">
            {testState === "recording" ? <button type="button" onClick={() => stopRecording()} className="inline-flex items-center gap-2 rounded-lg bg-discord-danger px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"><Square size={15}/> Parar e ouvir</button> : <button type="button" onClick={() => void startTest()} className="inline-flex items-center gap-2 rounded-lg bg-discord-brand px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"><Mic size={15}/> {recordingUrl ? "Gravar novamente" : "Iniciar teste"}</button>}
            {recordingUrl && testState !== "recording" && <button type="button" onClick={() => testState === "playing" ? stopPlayback() : void playRecording(recordingUrl)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-discord-text-normal transition hover:bg-white/5">{testState === "playing" ? <Square size={15}/> : <Play size={15}/>} {testState === "playing" ? "Parar" : "Ouvir teste"}</button>}
          </div>
        </div>
        <div className="mt-4 flex h-9 items-center gap-1" role="meter" aria-label="Nível de entrada do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(inputLevel * 100)}>
          {Array.from({ length: 24 }, (_, index) => <span key={index} className={`h-full flex-1 rounded-sm transition-colors ${index < activeBars ? index > 19 ? "bg-rose-400" : "bg-emerald-400" : "bg-white/10"}`} />)}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200">{error}</p>}
        {!error && notice && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-discord-text-muted"><Volume2 size={14}/>{notice}</p>}
        <p className="mt-3 text-[11px] text-discord-text-muted">{preferences.voiceProfile === "elevenlabs" ? "Use fones de ouvido durante o teste para evitar microfonia. Com a ElevenLabs, trechos curtos do teste são enviados para limpar o ruído e não ficam armazenados no Sekai." : "Use fones de ouvido durante o teste para evitar microfonia. A gravação fica apenas neste navegador e não é enviada ao Sekai."}</p>
      </div>
    </div>
  );
}
