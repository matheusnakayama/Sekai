import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getProfilePalette(color?: string | null) {
  const surface = color && /^#[\da-f]{6}$/i.test(color) ? color : "#0b0b0d";
  const channels = [1, 3, 5].map((offset) => Number.parseInt(surface.slice(offset, offset + 2), 16) / 255);
  const luminance = channels.reduce((total, value, index) => {
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return total + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  const isLight = luminance > 0.45;

  return {
    surface,
    isLight,
    text: isLight ? "#1f2024" : "#f2f3f5",
    muted: isLight ? "rgba(31,32,36,.68)" : "rgba(242,243,245,.68)",
    inset: isLight ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.08)",
    border: "#08090b",
  };
}
