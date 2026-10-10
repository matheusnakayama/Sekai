const ICON_SRC = "/sekai-symbol.jpg";
const BADGE_COLOR = "#ed4245";

let iconImage: HTMLImageElement | null = null;
let iconLoading: Promise<HTMLImageElement | null> | null = null;
let requestId = 0;

function loadIcon() {
  if (iconImage?.complete && iconImage.naturalWidth > 0) return Promise.resolve(iconImage);
  if (!iconLoading) {
    iconLoading = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        iconImage = image;
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = ICON_SRC;
    });
  }
  return iconLoading;
}

function iconLinks() {
  const found = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')];
  if (found.length) return found;
  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return [link];
}

function setIcons(href: string, type: string) {
  iconLinks().forEach((link) => {
    link.href = href;
    link.type = type;
  });
}

function badgeLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

function drawBadge(image: HTMLImageElement | null, count: number) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  if (image) {
    ctx.drawImage(image, 0, 0, size, size);
  } else {
    ctx.fillStyle = "#1e1f22";
    ctx.fillRect(0, 0, size, size);
  }
  const label = badgeLabel(count);
  const radius = label.length >= 3 ? 16 : label.length === 2 ? 15 : 14;
  const cx = size - radius - 1;
  const cy = radius + 1;
  ctx.beginPath();
  ctx.fillStyle = "#111214";
  ctx.arc(cx, cy, radius + 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = BADGE_COLOR;
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${label.length >= 3 ? 13 : label.length === 2 ? 16 : 18}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 0.5);
  return canvas;
}

export async function applyFaviconBadge(count: number) {
  if (typeof document === "undefined") return;
  const generation = ++requestId;
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  document.title = safeCount > 0 ? `(${badgeLabel(safeCount)}) Sekai` : "Sekai";
  if (safeCount <= 0) {
    setIcons(ICON_SRC, "image/jpeg");
    return;
  }
  const image = await loadIcon();
  if (generation !== requestId) return;
  const canvas = drawBadge(image, safeCount);
  if (!canvas || generation !== requestId) return;
  setIcons(canvas.toDataURL("image/png"), "image/png");
}
