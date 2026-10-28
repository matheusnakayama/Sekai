import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { downsampleMono, floatToPcm16, takePcmFrames } from "../lib/pcmFrames.ts";
import { allowIsolationRequest, isolateSpeechPcm, validIsolationPcm } from "../lib/elevenLabsIsolate.ts";

test("converts microphone blocks into 16 kHz PCM frames", () => {
  const block = new Float32Array(48);
  for (let index = 0; index < block.length; index += 1) block[index] = index / 48;
  const down = downsampleMono(block, 48_000, 16_000);
  assert.equal(down.length, 16);
  assert.ok(down[0] >= 0 && down[0] < down[15]);

  const pcm = floatToPcm16(Float32Array.of(1, -1, 0));
  const view = new DataView(pcm.buffer);
  assert.equal(view.getInt16(0, true), 32767);
  assert.equal(view.getInt16(2, true), -32768);
  assert.equal(view.getInt16(4, true), 0);

  const first = takePcmFrames(new Float32Array(3_100), new Float32Array(200));
  assert.equal(first.frames.length, 1);
  assert.equal(first.frames[0].byteLength, 6_400);
  assert.equal(first.pending.length, 100);
  assert.equal(validIsolationPcm(first.frames[0].byteLength), true);
  assert.equal(validIsolationPcm(100), false);
  assert.equal(validIsolationPcm(64_002), false);
});

test("limits isolation requests and forwards PCM without exposing the key", async () => {
  const userId = `user-${Date.now()}`;
  for (let index = 0; index < 8; index += 1) assert.equal(allowIsolationRequest(userId, 1_000), true);
  assert.equal(allowIsolationRequest(userId, 1_000), false);
  assert.equal(allowIsolationRequest(userId, 2_100), true);

  const pcm = floatToPcm16(new Float32Array(320));
  let seenKey = "";
  const audio = await isolateSpeechPcm(pcm, "secret-key", async (url, init) => {
    assert.equal(url, "https://api.elevenlabs.io/v1/audio-isolation/stream");
    seenKey = new Headers(init?.headers).get("xi-api-key") ?? "";
    assert.equal(init?.body?.get("file_format"), "pcm_s16le_16");
    const file = init?.body?.get("audio");
    assert.equal(file?.size, pcm.byteLength);
    return new Response(Uint8Array.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
  });
  assert.equal(seenKey, "secret-key");
  assert.equal(audio[0], 0xff);
  await assert.rejects(() => isolateSpeechPcm(pcm, "secret-key", async () => new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  })));
});

test("the isolation key stays on the server", () => {
  const route = readFileSync(new URL("../app/api/elevenlabs/isolate/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../lib/elevenLabsIsolation.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!userId\) return noStore\(\{ error: "Sessão inválida\." \}, 401\)/);
  assert.match(route, /ELEVENLABS_API_KEY/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_ELEVENLABS/);
  assert.doesNotMatch(client, /xi-api-key/);
  assert.match(client, /\/api\/elevenlabs\/isolate/);
});
