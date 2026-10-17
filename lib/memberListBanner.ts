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
  const slant = Math.round(height * 1.35);
  const fadeEnd = Math.min(width, start + slant);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${width}" y1="0" x2="${fadeEnd}" y2="${height}"><stop offset="0%" stop-color="white"/><stop offset="28%" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect x="${start}" y="0" width="${Math.max(0, width - start)}" height="${height}" fill="url(#g)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
