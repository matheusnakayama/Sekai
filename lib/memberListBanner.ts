/** Fade diagonal: sólido na direita e some em direção ao canto inferior esquerdo. */
export const MEMBER_LIST_BANNER_MASK =
  "linear-gradient(to bottom left, #000 0%, #000 46%, rgba(0,0,0,.78) 68%, rgba(0,0,0,.28) 84%, transparent 100%)";

/**
 * O banner antigo cobria a linha inteira. A faixa visível fica na metade direita da linha,
 * alta o bastante para a imagem aparecer.
 */
export function memberListBannerWidth(rowWidth: number) {
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return 0;
  const width = Math.round(rowWidth * 0.5);
  return width < 56 ? 0 : width;
}
