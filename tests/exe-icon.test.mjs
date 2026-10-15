import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const { extractIconPngFromPe, readExeIconPng } = createRequire(import.meta.url)("../lib/exeIcon.cjs");

const RED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNkYPj/nwEJMDIygAEABfoB/2pQ3bQAAAAASUVORK5CYII=",
  "base64",
);

function pngPixels(png) {
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  let offset = 8;
  const parts = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") parts.push(data);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const pixels = Buffer.alloc(width * height * 4);
  const stride = width * 4 + 1;
  for (let y = 0; y < height; y += 1) {
    assert.equal(raw[y * stride], 0);
    raw.copy(pixels, y * width * 4, y * stride + 1, y * stride + 1 + width * 4);
  }
  return { width, height, pixels };
}

function directory(offset, entries) {
  const buffer = Buffer.alloc(16 + entries.length * 8);
  buffer.writeUInt16LE(entries.length, 14);
  entries.forEach((entry, index) => {
    const at = 16 + index * 8;
    buffer.writeUInt32LE(entry.id >>> 0, at);
    buffer.writeUInt32LE((entry.child | (entry.isDir ? 0x80000000 : 0)) >>> 0, at + 4);
  });
  buffer.copy(offset.section, offset.at);
  return buffer.length;
}

function dataEntry(section, at, rva, size) {
  section.writeUInt32LE(rva, at);
  section.writeUInt32LE(size, at + 4);
}

function groupIcon(entries) {
  const buffer = Buffer.alloc(6 + entries.length * 14);
  buffer.writeUInt16LE(1, 2);
  buffer.writeUInt16LE(entries.length, 4);
  entries.forEach((entry, index) => {
    const at = 6 + index * 14;
    buffer[at] = entry.width >= 256 ? 0 : entry.width;
    buffer[at + 1] = entry.height >= 256 ? 0 : entry.height;
    buffer.writeUInt16LE(1, at + 4);
    buffer.writeUInt16LE(entry.bitCount, at + 6);
    buffer.writeUInt32LE(entry.bytes.length, at + 8);
    buffer.writeUInt16LE(entry.id, at + 12);
  });
  return buffer;
}

function buildResourceSection(images) {
  const group = groupIcon(images);
  const header = 0xd0;
  const section = Buffer.alloc(header + images.reduce((sum, image) => sum + image.bytes.length, 0) + group.length);
  directory(sectionAt(section, 0), [
    { id: 3, child: 0x20, isDir: true },
    { id: 14, child: 0x90, isDir: true },
  ]);
  directory(sectionAt(section, 0x20), images.map((image, index) => ({
    id: image.id,
    child: 0x40 + index * 0x18,
    isDir: true,
  })));
  images.forEach((image, index) => {
    directory(sectionAt(section, 0x40 + index * 0x18), [{ id: 0x409, child: 0x70 + index * 0x10, isDir: false }]);
  });
  let imageOffset = header;
  images.forEach((image, index) => {
    dataEntry(section, 0x70 + index * 0x10, 0x1000 + imageOffset, image.bytes.length);
    image.bytes.copy(section, imageOffset);
    imageOffset += image.bytes.length;
  });
  directory(sectionAt(section, 0x90), [{ id: 1, child: 0xa8, isDir: true }]);
  directory(sectionAt(section, 0xa8), [{ id: 0x409, child: 0xc0, isDir: false }]);
  dataEntry(section, 0xc0, 0x1000 + imageOffset, group.length);
  group.copy(section, imageOffset);
  return section;
}

function sectionAt(section, at) {
  return { section, at };
}

function wrapPe(section, pe64) {
  const sectionRva = 0x1000;
  const rawPtr = 0x400;
  const lfanew = 0x80;
  const optionalSize = pe64 ? 0xf0 : 0xe0;
  const pe = Buffer.alloc(rawPtr + section.length);
  pe.writeUInt16LE(0x5a4d, 0);
  pe.writeUInt32LE(lfanew, 0x3c);
  pe.writeUInt32LE(0x4550, lfanew);
  const coff = lfanew + 4;
  pe.writeUInt16LE(pe64 ? 0x8664 : 0x14c, coff);
  pe.writeUInt16LE(1, coff + 2);
  pe.writeUInt16LE(optionalSize, coff + 16);
  const optional = coff + 20;
  pe.writeUInt16LE(pe64 ? 0x20b : 0x10b, optional);
  const dataDirectory = optional + (pe64 ? 112 : 96);
  pe.writeUInt32LE(16, dataDirectory - 4);
  pe.writeUInt32LE(sectionRva, dataDirectory + 16);
  pe.writeUInt32LE(section.length, dataDirectory + 20);
  const sectionHeader = optional + optionalSize;
  pe.write(".rsrc", sectionHeader, 5, "ascii");
  pe.writeUInt32LE(section.length, sectionHeader + 8);
  pe.writeUInt32LE(sectionRva, sectionHeader + 12);
  pe.writeUInt32LE(section.length, sectionHeader + 16);
  pe.writeUInt32LE(rawPtr, sectionHeader + 20);
  section.copy(pe, rawPtr);
  return pe;
}

function bgra(r, g, b, a = 255) {
  return Buffer.from([b, g, r, a]);
}

function colorDib() {
  const xor = Buffer.concat([
    bgra(0, 255, 0), bgra(0, 255, 0),
    bgra(255, 0, 0), bgra(0, 0, 255),
  ]);
  const dib = Buffer.alloc(40 + xor.length + 8);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(2, 4);
  dib.writeInt32LE(4, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  xor.copy(dib, 40);
  return dib;
}

function maskedDib() {
  const xor = Buffer.concat([
    bgra(255, 0, 0, 0), bgra(0, 255, 0, 0),
  ]);
  const dib = Buffer.alloc(40 + xor.length + 4);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(2, 4);
  dib.writeInt32LE(2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  xor.copy(dib, 40);
  dib[40 + xor.length] = 0b01000000;
  return dib;
}

test("pulls the embedded PNG icon out of a 64-bit executable", () => {
  const section = buildResourceSection([
    { id: 1, width: 2, height: 2, bitCount: 32, bytes: colorDib() },
    { id: 2, width: 8, height: 8, bitCount: 32, bytes: RED_PNG },
  ]);
  const png = extractIconPngFromPe(wrapPe(section, true));
  assert.ok(png);
  assert.deepEqual(png, RED_PNG);
});

test("decodes a classic icon bitmap, including an empty alpha channel", () => {
  const color = pngPixels(extractIconPngFromPe(wrapPe(buildResourceSection([
    { id: 1, width: 2, height: 2, bitCount: 32, bytes: colorDib() },
  ]), false)));
  assert.deepEqual([...color.pixels], [
    255, 0, 0, 255, 0, 0, 255, 255,
    0, 255, 0, 255, 0, 255, 0, 255,
  ]);

  const masked = pngPixels(extractIconPngFromPe(wrapPe(buildResourceSection([
    { id: 1, width: 2, height: 1, bitCount: 32, bytes: maskedDib() },
  ]), false)));
  assert.equal(masked.pixels[3], 255);
  assert.equal(masked.pixels[7], 0);
});

test("reads only the resource section from an executable file", () => {
  const pe = wrapPe(buildResourceSection([
    { id: 7, width: 8, height: 8, bitCount: 32, bytes: RED_PNG },
  ]), true);
  const file = path.join(os.tmpdir(), `sekai-icon-${process.pid}.exe`);
  fs.writeFileSync(file, pe);
  try {
    assert.deepEqual(readExeIconPng(file), RED_PNG);
    assert.equal(readExeIconPng(file + ".missing"), null);
    assert.equal(extractIconPngFromPe(Buffer.from("not a pe")), null);
  } finally {
    fs.unlinkSync(file);
  }
});
