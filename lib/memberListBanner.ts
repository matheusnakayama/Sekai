/** Distância depois do nome antes de a imagem começar a aparecer. */
export const MEMBER_LIST_BANNER_GAP = 12;

/** A direita fica visível, mas um pouco abaixo de 100%. */
export const MEMBER_LIST_BANNER_OPACITY = 0.74;

/**
 * A faixa do nome fica vazia. A imagem entra por uma borda diagonal,
 * nunca por um retângulo de lado reto.
 */
export function memberListBannerMask(nameEnd: number, rowWidth: number, rowHeight = 46) {
  const width = Math.max(1, Math.round(Number.isFinite(rowWidth) && rowWidth > 0 ? rowWidth : 240));
  const height = Math.max(1, Math.round(Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 46));
  const start = Math.max(0, Math.min(width, Math.round(Number.isFinite(nameEnd) ? nameEnd : 0)));
  const room = width - start;
  const slant = Math.max(22, Math.round(height * 1.45));
  let bottom = start;
  let top = Math.min(width, start + slant);
  if (room < slant) {
    const wedge = Math.max(room, Math.min(Math.round(height * 1.2), Math.floor(width * 0.5)));
    bottom = Math.max(0, width - wedge);
    top = Math.min(width, bottom + Math.max(18, Math.round(wedge * 0.62)));
  }
  if (top - bottom < 14) top = Math.min(width, bottom + 14);
  if (bottom >= top) bottom = Math.max(0, top - 14);
  const rise = Math.max(1, top - bottom);
  const length = Math.hypot(height, rise);
  const feather = Math.max(12, Math.round(height * 0.55));
  const fadeX = Math.round(bottom + (height / length) * feather);
  const fadeY = Math.round(height + (rise / length) * feather);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${bottom}" y1="${height}" x2="${fadeX}" y2="${fadeY}"><stop offset="0%" stop-color="white" stop-opacity="0"/><stop offset="100%" stop-color="white"/></linearGradient></defs><polygon points="${top},0 ${width},0 ${width},${height} ${bottom},${height}" fill="url(#g)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
