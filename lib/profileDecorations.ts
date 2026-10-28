export const PROFILE_DECORATIONS = [
  { id: "solara", name: "Solara", description: "Arco dourado, sol e pingentes" },
  { id: "vigilia", name: "Vigília", description: "Moldura de olhos ao redor do cartão" },
  { id: "sakura", name: "Sakura", description: "Galhos e flores nos cantos" },
  { id: "neon", name: "Neon", description: "Cantos luminosos em ciano e rosa" },
  { id: "loto", name: "Lótus", description: "Flores e folhas sobre a água" },
  { id: "brasa", name: "Brasa", description: "Chamas e faíscas ao redor do avatar" },
  { id: "aurora", name: "Aurora", description: "Fitas de luz no topo do perfil" },
  { id: "estrelas", name: "Estrelas", description: "Constelação sobre o banner" },
  { id: "geada", name: "Geada", description: "Cristais de gelo nos cantos" },
  { id: "realeza", name: "Realeza", description: "Coroa e adornos dourados" },
] as const;

export type ProfileDecorationId = (typeof PROFILE_DECORATIONS)[number]["id"];

export function profileDecorationById(id?: string | null) {
  if (!id) return null;
  return PROFILE_DECORATIONS.find((item) => item.id === id) ?? null;
}

export function normalizeProfileDecoration(id?: string | null): ProfileDecorationId | null {
  return profileDecorationById(id)?.id ?? null;
}

export function isMissingProfileDecorationColumn(error: { message?: string; code?: string } | null | undefined) {
  const message = `${error?.message ?? ""} ${error?.code ?? ""}`.toLowerCase();
  return message.includes("profile_decoration");
}

export function withProfileDecorationColumn(select: string) {
  if (select.includes("profile_decoration")) return select;
  return select.replaceAll("profile_card_color", "profile_card_color,profile_decoration");
}

export function withoutProfileDecorationColumn(select: string) {
  return select.replaceAll(",profile_decoration", "").replaceAll("profile_decoration,", "");
}
