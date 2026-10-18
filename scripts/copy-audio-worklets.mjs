import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDist = path.join(projectRoot, "node_modules", "@sapphi-red", "web-noise-suppressor", "dist");
const destination = path.join(projectRoot, "public", "audio-worklets");
const assets = [
  [path.join(packageDist, "rnnoise", "workletProcessor.js"), path.join(destination, "rnnoiseWorklet.js")],
  [path.join(packageDist, "rnnoise.wasm"), path.join(destination, "rnnoise.wasm")],
  [path.join(packageDist, "rnnoise_simd.wasm"), path.join(destination, "rnnoise_simd.wasm")],
  [path.join(packageDist, "gtcrn", "workletProcessor.js"), path.join(destination, "gtcrnWorklet.js")],
  [path.join(packageDist, "gtcrn.wasm"), path.join(destination, "gtcrn.wasm")],
  [path.join(projectRoot, "audio-worklets", "pcmCaptureWorklet.js"), path.join(destination, "pcmCaptureWorklet.js")],
  [path.join(projectRoot, "audio-worklets", "speechExpanderWorklet.js"), path.join(destination, "speechExpanderWorklet.js")],
];

await mkdir(destination, { recursive: true });
await Promise.all(assets.map(([source, target]) => copyFile(source, target)));
