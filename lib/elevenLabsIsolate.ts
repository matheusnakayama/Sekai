const ENDPOINT = "https://api.elevenlabs.io/v1/audio-isolation/stream";
const MAX_RESPONSE_BYTES = 256 * 1024;
const recentRequests = new Map<string, number[]>();

export function allowIsolationRequest(userId: string, now: number, limit = 8, windowMs = 1_000): boolean {
  const recent = (recentRequests.get(userId) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    recentRequests.set(userId, recent);
    return false;
  }
  recent.push(now);
  recentRequests.set(userId, recent);
  if (recentRequests.size > 500) {
    const oldest = recentRequests.keys().next().value;
    if (oldest) recentRequests.delete(oldest);
  }
  return true;
}

export function validIsolationPcm(byteLength: number): boolean {
  return byteLength >= 320 && byteLength <= 64_000 && byteLength % 2 === 0;
}

async function readLimited(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("elevenlabs_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function isolateSpeechPcm(pcm: Uint8Array, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const form = new FormData();
  const copy = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
  form.append("file_format", "pcm_s16le_16");
  form.append("audio", new Blob([copy], { type: "application/octet-stream" }), "mic.pcm");
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`elevenlabs_${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json") || type.startsWith("text/")) throw new Error("elevenlabs_unexpected_type");
  const audio = await readLimited(response);
  if (audio.byteLength < 16) throw new Error("elevenlabs_empty");
  return audio;
}
