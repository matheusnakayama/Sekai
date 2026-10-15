const fs = require("fs");
const zlib = require("zlib");

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const MAX_RESOURCE_BYTES = 24 * 1024 * 1024;
const MAX_ICON_BYTES = 2_000_000;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodeRgbaPng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 4 + 1);
    rgba.copy(raw, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function isPng(buffer) {
  return buffer.length >= 24
    && buffer.readUInt32BE(0) === 0x89504e47
    && buffer.readUInt32BE(4) === 0x0d0a1a0a;
}

function pngSize(buffer) {
  if (!isPng(buffer)) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096) return null;
  return { width, height };
}

function parsePeHeaders(buffer) {
  if (!buffer || buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) return null;
  const lfanew = buffer.readUInt32LE(0x3c);
  if (lfanew < 64 || lfanew > 1024 * 1024 || lfanew + 24 > buffer.length) return null;
  if (buffer.readUInt32LE(lfanew) !== 0x4550) return null;
  const coff = lfanew + 4;
  const sectionCount = buffer.readUInt16LE(coff + 2);
  const optionalSize = buffer.readUInt16LE(coff + 16);
  const optional = coff + 20;
  if (!sectionCount || sectionCount > 96 || optional + optionalSize > buffer.length) return null;
  const magic = buffer.readUInt16LE(optional);
  const dataDirectory = magic === 0x20b ? optional + 112 : magic === 0x10b ? optional + 96 : null;
  if (dataDirectory == null || dataDirectory + 24 > optional + optionalSize) return null;
  const resourceRva = buffer.readUInt32LE(dataDirectory + 16);
  const resourceSize = buffer.readUInt32LE(dataDirectory + 20);
  const sectionTable = optional + optionalSize;
  if (sectionTable + sectionCount * 40 > buffer.length) return null;
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const at = sectionTable + index * 40;
    sections.push({
      virtualSize: buffer.readUInt32LE(at + 8),
      virtualAddress: buffer.readUInt32LE(at + 12),
      sizeOfRawData: buffer.readUInt32LE(at + 16),
      pointerToRawData: buffer.readUInt32LE(at + 20),
    });
  }
  return { sections, resourceRva, resourceSize };
}

function rvaToOffset(sections, rva) {
  for (const section of sections) {
    const span = Math.max(section.virtualSize, section.sizeOfRawData);
    if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
      return section.pointerToRawData + (rva - section.virtualAddress);
    }
  }
  return null;
}

function directoryEntries(section, offset) {
  if (offset < 0 || offset + 16 > section.length) return null;
  const count = section.readUInt16LE(offset + 12) + section.readUInt16LE(offset + 14);
  if (count > 4096 || offset + 16 + count * 8 > section.length) return null;
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const at = offset + 16 + index * 8;
    const name = section.readUInt32LE(at);
    const next = section.readUInt32LE(at + 4);
    entries.push({
      id: name & 0x7fffffff,
      named: (name & 0x80000000) !== 0,
      isDir: (next & 0x80000000) !== 0,
      child: next & 0x7fffffff,
    });
  }
  return entries;
}

function resourceBytes(section, offset, sectionRva) {
  if (offset < 0 || offset + 16 > section.length) return null;
  const size = section.readUInt32LE(offset + 4);
  if (!size || size > MAX_ICON_BYTES) return null;
  const start = section.readUInt32LE(offset) - sectionRva;
  if (start < 0 || start + size > section.length) return null;
  return section.subarray(start, start + size);
}

function parseGroupIcon(group) {
  if (!group || group.length < 6) return [];
  const count = group.readUInt16LE(4);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 14;
    if (at + 14 > group.length) break;
    entries.push({
      width: group[at] || 256,
      height: group[at + 1] || 256,
      id: group.readUInt16LE(at + 12),
    });
  }
  return entries;
}

function channelMask(mask) {
  let value = mask >>> 0;
  let shift = 0;
  while (shift < 32 && (value & 1) === 0) {
    value >>>= 1;
    shift += 1;
  }
  let bits = 0;
  while (bits < 32 && (value & 1) === 1) {
    value >>>= 1;
    bits += 1;
  }
  return { shift, bits, max: bits ? (1 << bits) - 1 : 1 };
}

function sampleChannel(value, channel) {
  if (!channel.bits) return 255;
  const raw = (value >>> channel.shift) & channel.max;
  return channel.bits === 8 ? raw : Math.round((raw * 255) / channel.max);
}

function dibToPng(dib, dirWidth, dirHeight) {
  if (!dib || dib.length < 40) return null;
  const headerSize = dib.readUInt32LE(0);
  if (headerSize < 40 || headerSize > dib.length) return null;
  const dibWidth = Math.abs(dib.readInt32LE(4));
  const heightField = dib.readInt32LE(8);
  const topDown = heightField < 0;
  const dibHeight = Math.abs(heightField);
  const bitCount = dib.readUInt16LE(14);
  const compression = dib.readUInt32LE(16);
  if (![0, 3].includes(compression) || ![1, 4, 8, 24, 32].includes(bitCount)) return null;
  const width = dirWidth || dibWidth;
  if (!width || width !== dibWidth || width > 1024 || dibHeight > 2048) return null;
  const height = dirHeight && (dibHeight === dirHeight || dibHeight === dirHeight * 2)
    ? dirHeight
    : (dibHeight > width && dibHeight % 2 === 0 ? dibHeight / 2 : dibHeight);
  if (!height || height > 1024 || (dibHeight !== height && dibHeight !== height * 2)) return null;

  const clrUsed = headerSize >= 36 ? dib.readUInt32LE(32) : 0;
  const paletteCount = bitCount <= 8 ? (clrUsed || (1 << bitCount)) : 0;
  let masks = null;
  let pixelOffset = headerSize + paletteCount * 4;
  if (compression === 3) {
    if (headerSize >= 56) {
      masks = {
        r: dib.readUInt32LE(40),
        g: dib.readUInt32LE(44),
        b: dib.readUInt32LE(48),
        a: dib.readUInt32LE(52),
      };
      pixelOffset = headerSize + paletteCount * 4;
    } else if (dib.length >= headerSize + 12) {
      masks = {
        r: dib.readUInt32LE(headerSize),
        g: dib.readUInt32LE(headerSize + 4),
        b: dib.readUInt32LE(headerSize + 8),
        a: dib.length >= headerSize + 16 ? dib.readUInt32LE(headerSize + 12) : 0,
      };
      pixelOffset = headerSize + (masks.a ? 16 : 12) + paletteCount * 4;
    }
  }
  const channels = masks ? {
    r: channelMask(masks.r),
    g: channelMask(masks.g),
    b: channelMask(masks.b),
    a: channelMask(masks.a),
  } : null;
  const xorStride = Math.floor((width * bitCount + 31) / 32) * 4;
  const andStride = Math.floor((width + 31) / 32) * 4;
  if (pixelOffset + xorStride * height > dib.length) return null;
  const andOffset = pixelOffset + xorStride * height;
  const hasAnd = dibHeight === height * 2 && andOffset + andStride * height <= dib.length;
  const palette = paletteCount ? dib.subarray(headerSize, headerSize + paletteCount * 4) : null;
  let useStoredAlpha = Boolean(channels?.a.bits);
  if (bitCount === 32 && !useStoredAlpha) {
    for (let y = 0; y < height && !useStoredAlpha; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (dib[pixelOffset + y * xorStride + x * 4 + 3]) {
          useStoredAlpha = true;
          break;
        }
      }
    }
  }

  function transparent(x, y) {
    if (!hasAnd) return false;
    const byte = dib[andOffset + y * andStride + (x >> 3)];
    return (byte & (0x80 >> (x & 7))) !== 0;
  }

  const rgba = Buffer.alloc(width * height * 4);
  function write(x, y, r, g, b, a) {
    const row = topDown ? y : height - 1 - y;
    const at = (row * width + x) * 4;
    rgba[at] = r;
    rgba[at + 1] = g;
    rgba[at + 2] = b;
    rgba[at + 3] = transparent(x, y) ? 0 : a;
  }

  if (bitCount === 32 || bitCount === 24) {
    const bytesPerPixel = bitCount / 8;
    for (let y = 0; y < height; y += 1) {
      const row = pixelOffset + y * xorStride;
      for (let x = 0; x < width; x += 1) {
        const at = row + x * bytesPerPixel;
        if (bitCount === 32 && channels) {
          const value = dib.readUInt32LE(at);
          write(
            x,
            y,
            sampleChannel(value, channels.r),
            sampleChannel(value, channels.g),
            sampleChannel(value, channels.b),
            useStoredAlpha ? sampleChannel(value, channels.a) : 255,
          );
        } else if (bitCount === 32) {
          write(x, y, dib[at + 2], dib[at + 1], dib[at], useStoredAlpha ? dib[at + 3] : 255);
        } else {
          write(x, y, dib[at + 2], dib[at + 1], dib[at], 255);
        }
      }
    }
  } else if (palette) {
    for (let y = 0; y < height; y += 1) {
      const row = pixelOffset + y * xorStride;
      for (let x = 0; x < width; x += 1) {
        let index = 0;
        if (bitCount === 8) index = dib[row + x];
        else if (bitCount === 4) {
          const byte = dib[row + (x >> 1)];
          index = (x & 1) === 0 ? byte >> 4 : byte & 0x0f;
        } else {
          index = (dib[row + (x >> 3)] & (0x80 >> (x & 7))) ? 1 : 0;
        }
        const color = index * 4;
        write(x, y, palette[color + 2] || 0, palette[color + 1] || 0, palette[color] || 0, 255);
      }
    }
  } else {
    return null;
  }

  const fitted = width > 256 || height > 256 ? downscale(rgba, width, height, 256) : { rgba, width, height };
  return encodeRgbaPng(fitted.width, fitted.height, fitted.rgba);
}

function downscale(rgba, width, height, max) {
  const scale = max / Math.max(width, height);
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  const next = Buffer.alloc(nextWidth * nextHeight * 4);
  for (let y = 0; y < nextHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < nextWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x / scale));
      rgba.copy(next, (y * nextWidth + x) * 4, (sourceY * width + sourceX) * 4, (sourceY * width + sourceX) * 4 + 4);
    }
  }
  return { rgba: next, width: nextWidth, height: nextHeight };
}

function iconScore(candidate) {
  const png = pngSize(candidate.image);
  const width = png?.width || candidate.width || 1;
  const height = png?.height || candidate.height || 1;
  return width * height * 10 + (png ? 1 : 0);
}

function iconToPng(candidate) {
  if (isPng(candidate.image)) return Buffer.from(candidate.image);
  return dibToPng(candidate.image, candidate.width, candidate.height);
}

function extractIconPngFromResource(section, sectionRva) {
  const types = directoryEntries(section, 0);
  if (!types) return null;
  const icons = new Map();
  const groups = [];
  for (const type of types) {
    if (type.named || !type.isDir || (type.id !== RT_ICON && type.id !== RT_GROUP_ICON)) continue;
    const names = directoryEntries(section, type.child);
    if (!names) continue;
    for (const name of names) {
      if (!name.isDir) continue;
      const languages = directoryEntries(section, name.child);
      const leaf = languages?.find((entry) => !entry.isDir);
      if (!leaf) continue;
      const data = resourceBytes(section, leaf.child, sectionRva);
      if (!data) continue;
      if (type.id === RT_ICON && !name.named) icons.set(name.id, data);
      if (type.id === RT_GROUP_ICON) groups.push(data);
    }
  }
  const candidates = [];
  for (const group of groups) {
    for (const entry of parseGroupIcon(group)) {
      const image = icons.get(entry.id);
      if (image) candidates.push({ width: entry.width, height: entry.height, image });
    }
  }
  if (!candidates.length) {
    for (const image of icons.values()) candidates.push({ width: 0, height: 0, image });
  }
  candidates.sort((a, b) => iconScore(b) - iconScore(a));
  for (const candidate of candidates) {
    const png = iconToPng(candidate);
    if (png) return png;
  }
  return null;
}

function extractIconPngFromPe(pe) {
  const headers = parsePeHeaders(pe);
  if (!headers?.resourceRva || !headers.resourceSize || headers.resourceSize > MAX_RESOURCE_BYTES) return null;
  const offset = rvaToOffset(headers.sections, headers.resourceRva);
  if (offset == null || offset < 0 || offset + headers.resourceSize > pe.length) return null;
  return extractIconPngFromResource(pe.subarray(offset, offset + headers.resourceSize), headers.resourceRva);
}

function readExact(fd, size, position) {
  const buffer = Buffer.alloc(size);
  const read = fs.readSync(fd, buffer, 0, size, position);
  return read === size ? buffer : buffer.subarray(0, read);
}

function readExeIconPng(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const dos = readExact(fd, 64, 0);
    if (dos.length < 64) return null;
    const lfanew = dos.readUInt32LE(0x3c);
    if (lfanew < 64 || lfanew > 1024 * 1024) return null;
    const prefixSize = lfanew + 24 + 256 + 96 * 40;
    const prefix = readExact(fd, prefixSize, 0);
    const headers = parsePeHeaders(prefix);
    if (!headers?.resourceRva || !headers.resourceSize || headers.resourceSize > MAX_RESOURCE_BYTES) return null;
    const offset = rvaToOffset(headers.sections, headers.resourceRva);
    if (offset == null || offset < 0) return null;
    const section = readExact(fd, headers.resourceSize, offset);
    if (section.length < 16) return null;
    return extractIconPngFromResource(section, headers.resourceRva);
  } catch {
    return null;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

module.exports = { extractIconPngFromPe, readExeIconPng };
