/** Distância depois do nome antes de a imagem começar a aparecer. */
export const MEMBER_LIST_BANNER_GAP = 12;

/** A direita fica visível, mas um pouco abaixo de 100%. */
export const MEMBER_LIST_BANNER_OPACITY = 0.74;

/**
 * Fade transversal: sólido no canto superior direito e some em direção
 * ao canto inferior esquerdo, deixando o nome na área clara.
 */
export function memberListBannerMask(nameEnd: number, rowWidth: number) {
  const width = Number.isFinite(rowWidth) && rowWidth > 0 ? rowWidth : 240;
  const start = Math.max(0, Math.min(width, Number.isFinite(nameEnd) ? nameEnd : 0));
  const clear = Math.round(100 - (start / width) * 46);
  const solid = Math.max(4, clear - 34);
  return `linear-gradient(to bottom left, #000 0%, #000 ${solid}%, transparent ${Math.min(99, clear)}%)`;
}
