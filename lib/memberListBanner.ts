/** Distância depois do nome antes de a imagem começar a aparecer. */
export const MEMBER_LIST_BANNER_GAP = 12;

/** A direita fica visível, mas um pouco abaixo de 100%. */
export const MEMBER_LIST_BANNER_OPACITY = 0.74;

/**
 * A faixa do nome fica vazia em toda a altura. Depois dela, o fade sobe
 * em diagonal até o canto superior direito.
 */
export function memberListBannerMask(nameEnd: number, rowWidth: number, rowHeight = 46) {
  const width = Math.max(1, Math.round(Number.isFinite(rowWidth) && rowWidth > 0 ? rowWidth : 240));
  const height = Math.max(1, Math.round(Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 46));
  const start = Math.max(0, Math.min(width, Math.round(Number.isFinite(nameEnd) ? nameEnd : 0)));
  const room = width - start;
  const slant = Math.round(height * 1.35);
  const tight = room < slant;
  const minWedge = Math.max(room, Math.min(Math.round(height * 0.9), Math.floor(width * 0.42)));
  const paintStart = tight ? Math.max(0, width - minWedge) : start;
  const fadeX = tight ? paintStart : Math.min(width, start + slant);
  const shape = tight
    ? `<polygon points="${paintStart},0 ${width},0 ${width},${height}" fill="url(#g)"/>`
    : `<rect x="${start}" y="0" width="${Math.max(0, room)}" height="${height}" fill="url(#g)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${width}" y1="0" x2="${fadeX}" y2="${height}"><stop offset="0%" stop-color="white"/><stop offset="${tight ? "22%" : "28%"}" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient></defs>${shape}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
