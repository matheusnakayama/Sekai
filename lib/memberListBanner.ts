/** Fade diagonal: sólido na direita e some em direção ao canto inferior esquerdo. */
export const MEMBER_LIST_BANNER_MASK =
  "linear-gradient(to bottom left, #000 0%, #000 26%, rgba(0,0,0,.62) 54%, rgba(0,0,0,.16) 78%, transparent 100%)";

/**
 * O GIF ocupava a faixa inteira depois do nome. A largura visível fica na metade dessa faixa.
 */
export function memberListBannerWidth(rowWidth: number, contentEnd: number) {
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return 0;
  const span = Math.max(0, rowWidth - Math.max(0, contentEnd));
  return Math.round(span * 0.5);
}
