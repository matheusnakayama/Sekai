/** Cor de destaque dos links: o matiz oposto ao do tema, claro no chat escuro. */

function hexToRgb(color: string): [number, number, number] {
  const value = color.replace("#", "").trim();
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)) as [number, number, number];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta < 1e-6) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs(sector % 2 - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (sector < 1) [red, green, blue] = [chroma, x, 0];
  else if (sector < 2) [red, green, blue] = [x, chroma, 0];
  else if (sector < 3) [red, green, blue] = [0, chroma, x];
  else if (sector < 4) [red, green, blue] = [0, x, chroma];
  else if (sector < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  const match = lightness - chroma / 2;
  const channel = (value: number) => Math.round((value + match) * 255).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function chromaOf(color: string) {
  const [red, green, blue] = hexToRgb(color);
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

function hueDistance(a: number, b: number) {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

function channelLuminance(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function contrastOnChat(color: string) {
  const [red, green, blue] = hexToRgb(color);
  const link = 0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
  const chat = 0.2126 * channelLuminance(49) + 0.7152 * channelLuminance(51) + 0.0722 * channelLuminance(56);
  const lighter = Math.max(link, chat);
  const darker = Math.min(link, chat);
  return (lighter + 0.05) / (darker + 0.05);
}

function primaryStop(stops: readonly string[]) {
  const middle = stops[Math.min(3, stops.length - 1)] ?? "#5865f2";
  if (chromaOf(middle) >= 18) return middle;
  return stops.reduce((best, stop) => (chromaOf(stop) > chromaOf(best) ? stop : best), middle);
}

function oppositeHue(hue: number) {
  const raw = (hue + 180) % 360;
  // O oposto do roxo cai no verde-limão. Puxa para o amarelo, que é o destaque pedido.
  if (raw >= 75 && raw <= 110) return 54 + (raw - 75) * 0.2;
  return raw;
}

function avoidThemeStops(hue: number, stops: readonly string[]) {
  const occupied = stops
    .filter((stop) => chromaOf(stop) >= 28)
    .map((stop) => rgbToHsl(...hexToRgb(stop))[0]);
  if (occupied.length === 0) return hue;
  const current = Math.min(...occupied.map((stopHue) => hueDistance(hue, stopHue)));
  // Já está longe das cores do tema. Não empurra o amarelo do roxo de volta para o limão.
  if (current >= 48) return hue;
  let bestHue = hue;
  let bestScore = -Infinity;
  for (let shift = 0; shift <= 80; shift += 8) {
    const signs = shift === 0 ? [0] : [-1, 1];
    for (const sign of signs) {
      const candidate = (hue + sign * shift + 360) % 360;
      const nearest = Math.min(...occupied.map((stopHue) => hueDistance(candidate, stopHue)));
      const score = nearest - shift * 0.45;
      if (score > bestScore) {
        bestScore = score;
        bestHue = candidate;
      }
    }
  }
  return bestHue;
}

export function complementaryLinkColor(stops: readonly string[]) {
  const source = primaryStop(stops);
  const [red, green, blue] = hexToRgb(source);
  const [hue, saturation] = rgbToHsl(red, green, blue);
  const sourceChroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  const baseHue = sourceChroma < 8 ? 52 : oppositeHue(hue);
  const linkHue = avoidThemeStops(baseHue, stops);
  const linkSaturation = sourceChroma < 18 ? 0.86 : Math.min(0.94, Math.max(0.78, saturation));
  let lightness = 0.64;
  let color = hslToHex(linkHue, linkSaturation, lightness);
  while (contrastOnChat(color) < 4.5 && lightness < 0.78) {
    lightness += 0.02;
    color = hslToHex(linkHue, linkSaturation, lightness);
  }
  return color;
}
