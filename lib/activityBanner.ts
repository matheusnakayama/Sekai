/** O painel usava 62% da altura. Metade dessa área. */
export const ACTIVITY_PANEL_HEIGHT = "31%";

/** Fade transversal: visível no canto superior direito e some para baixo à esquerda. */
export const ACTIVITY_PANEL_MASK =
  "linear-gradient(to bottom left, #000 0%, #000 20%, rgba(0,0,0,.55) 48%, rgba(0,0,0,.16) 72%, transparent 100%)";

const CROP_COLUMNS = "activity_banner_position_x,activity_banner_position_y,activity_banner_zoom";

export function withActivityBannerCrop(select: string) {
  if (select.includes("activity_banner_position_x")) return select;
  return select.replaceAll("activity_banner_url", `activity_banner_url,${CROP_COLUMNS}`);
}

export function withoutActivityBannerCrop(select: string) {
  return select.replaceAll(`,${CROP_COLUMNS}`, "").replaceAll(`${CROP_COLUMNS},`, "");
}

export function isMissingActivityBannerCropColumn(error: { message?: string; code?: string } | null | undefined) {
  const message = `${error?.message ?? ""} ${error?.code ?? ""}`.toLowerCase();
  return message.includes("activity_banner_position") || message.includes("activity_banner_zoom");
}
