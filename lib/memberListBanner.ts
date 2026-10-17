/** Distância depois do nome antes de a imagem começar a aparecer. */
export const MEMBER_LIST_BANNER_GAP = 12;

/** Quanto a opacidade leva para ir de 0 a 100%, da esquerda para a direita. */
export const MEMBER_LIST_BANNER_FADE = 68;

/**
 * Máscara horizontal: transparente até um pouco depois do nome,
 * depois sobe até opacidade total na direita.
 */
export function memberListBannerMask(nameEnd: number) {
  const start = Math.max(0, Math.round(nameEnd));
  const solid = start + MEMBER_LIST_BANNER_FADE;
  return `linear-gradient(90deg, transparent 0px, transparent ${start}px, #000 ${solid}px, #000 100%)`;
}
