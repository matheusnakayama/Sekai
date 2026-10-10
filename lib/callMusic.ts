export function isPlayableAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(mp3|mpeg|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i.test(file.name);
}

export interface CallMusicPlayback {
  url: string;
  audio: HTMLAudioElement;
  context: AudioContext;
  localGain: GainNode;
  track: MediaStreamTrack;
}

export async function startCallMusicPlayback(file: File, hearLocally: boolean): Promise<CallMusicPlayback> {
  const url = URL.createObjectURL(file);
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  const context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  const destination = context.createMediaStreamDestination();
  const localGain = context.createGain();
  localGain.gain.value = hearLocally ? 1 : 0;
  source.connect(destination);
  source.connect(localGain);
  localGain.connect(context.destination);
  try {
    await context.resume();
    await audio.play();
  } catch (error) {
    audio.pause();
    audio.src = "";
    URL.revokeObjectURL(url);
    await context.close().catch(() => undefined);
    throw error;
  }
  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    audio.pause();
    audio.src = "";
    URL.revokeObjectURL(url);
    await context.close().catch(() => undefined);
    throw new Error("Não foi possível preparar o áudio.");
  }
  return { url, audio, context, localGain, track };
}

export async function stopCallMusicPlayback(playback: CallMusicPlayback | null) {
  if (!playback) return;
  playback.audio.pause();
  playback.audio.src = "";
  playback.track.stop();
  URL.revokeObjectURL(playback.url);
  await playback.context.close().catch(() => undefined);
}
