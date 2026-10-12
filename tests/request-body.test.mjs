import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedJson, readBoundedText } from "../lib/http/requestBody.ts";

test("lê JSON dentro do limite sem transformar conteúdo", async () => {
  const request = new Request("https://sekai.invalid/api", { method: "POST", body: JSON.stringify({ roomId: "room-1234" }) });
  assert.deepEqual(await readBoundedJson(request, 128), { roomId: "room-1234" });
});

test("descarta corpo acima do limite e UTF-8 inválido", async () => {
  const oversized = new Request("https://sekai.invalid/api", { method: "POST", body: "x".repeat(4097) });
  assert.equal(await readBoundedText(oversized, 4096), null);
  const invalidUtf8 = new Request("https://sekai.invalid/api", {
    method: "POST",
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff, 0xfe])); controller.close(); } }),
    duplex: "half",
  });
  assert.equal(await readBoundedText(invalidUtf8, 32), null);
});

test("descarta JSON malformado sem propagar exceção", async () => {
  const request = new Request("https://sekai.invalid/api", { method: "POST", body: "{broken" });
  assert.equal(await readBoundedJson(request, 128), null);
});
