/** Modo claro é o padrão. O modo escuro rebaixa um pouco a claridade das mesmas cores. */

export const COLOR_MODE_STORAGE_KEY = "sekai-color-mode";
export type ColorMode = "light" | "dark";
export const DEFAULT_COLOR_MODE: ColorMode = "light";

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

/** Abaixa bastante a claridade e guarda o matiz. Os tons já escuros descem pouco. */
export function darkenThemeColor(color: string) {
  const [red, green, blue] = hexToRgb(color);
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  const next = Math.max(0.09, lightness * 0.36 + 0.04);
  const nextSaturation = saturation < 0.08 ? saturation : Math.min(1, saturation * 1.08);
  return hslToHex(hue, nextSaturation, next);
}

export function colorsForMode(stops: readonly string[], mode: ColorMode) {
  return mode === "dark" ? stops.map(darkenThemeColor) : [...stops];
}

function mixWithWhite(color: string, amount: number) {
  return hexToRgb(color).map((value) => Math.round(value + (255 - value) * amount)).join(" ");
}

function channels(color: string) {
  return hexToRgb(color).join(" ");
}

/** Variáveis de acento do tema. As superfícies do chat ficam com o valor do CSS. */
export function accentVariables(stops: readonly string[], background: readonly [string, string], washAlpha: number) {
  const variables: Record<string, string> = {};
  ["50", "100", "200", "300"].forEach((step, index) => {
    variables[`--brand-${step}`] = mixWithWhite(stops[0], [0.94, 0.82, 0.62, 0.36][index]);
  });
  [400, 500, 600, 700, 800, 900].forEach((step, index) => {
    variables[`--brand-${step}`] = channels(stops[[0, 1, 2, 4, 5, 6][index]]);
  });
  variables["--d-brand"] = channels(stops[3]);
  variables["--d-brand-hover"] = channels(stops[4]);
  stops.forEach((color, index) => {
    variables[`--g${index + 1}`] = color;
    variables[`--gw${index + 1}`] = `rgb(${channels(color)} / ${washAlpha.toFixed(2)})`;
  });
  variables["--bg-gradient-start"] = background[0];
  variables["--bg-gradient-end"] = background[1];
  return variables;
}
