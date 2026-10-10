import { useId } from "react";
import { cn } from "@/lib/utils";

export type Presence = "online" | "idle" | "dnd" | "offline";

const PRESENCE_COLORS: Record<Presence, string> = {
  online: "#23a55a",
  idle: "#f0b232",
  dnd: "#f23f43",
  offline: "#747f8d",
};

const PRESENCE_LABELS: Record<Presence, string> = {
  online: "Online",
  idle: "Ausente",
  dnd: "Não perturbe",
  offline: "Invisível",
};

export function PresenceIndicator({
  presence,
  size = 16,
  className,
  borderColor,
  cutoutColor = "#232428",
  dndBarColor = cutoutColor,
  hollowSymbols = false,
  borderWidth = 0,
  avatarBadge = false,
}: {
  presence: Presence;
  size?: number;
  className?: string;
  borderColor?: string;
  cutoutColor?: string;
  dndBarColor?: string;
  hollowSymbols?: boolean;
  borderWidth?: number;
  /** Places a single-size presence badge at the avatar container's lower-right corner. */
  avatarBadge?: boolean;
}) {
  const maskId = useId().replace(/:/g, "");
  const indicatorBorderWidth = avatarBadge ? 3 : borderWidth;
  const badgeSize = "clamp(14px, 28%, 20px)";
  const iconSize = avatarBadge ? `calc(${badgeSize} - 6px)` : Math.max(0, size - borderWidth * 2);
  const hollowDnd = hollowSymbols || avatarBadge;

  return (
    <span
      role="img"
      aria-label={PRESENCE_LABELS[presence]}
      title={PRESENCE_LABELS[presence]}
      className={cn("presence-indicator inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{
        position: avatarBadge ? "absolute" : "relative",
        right: avatarBadge ? 2 : undefined,
        bottom: avatarBadge ? 2 : undefined,
        zIndex: avatarBadge ? 10 : undefined,
        width: avatarBadge ? badgeSize : size,
        height: avatarBadge ? badgeSize : size,
        backgroundColor: presence === "idle" || (hollowDnd && presence === "dnd") ? "transparent" : PRESENCE_COLORS[presence],
        borderColor: borderColor ?? "transparent",
        borderStyle: indicatorBorderWidth > 0 ? "solid" : "none",
        borderWidth: indicatorBorderWidth,
        boxSizing: "border-box",
      }}
    >
      {presence === "idle" && <svg aria-hidden="true" viewBox="0 0 16 16" width={iconSize} height={iconSize} className="shrink-0">
        <defs>
          <mask id={`${maskId}-idle`} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
            <rect width="16" height="16" fill="white" />
            <circle cx="10.5" cy="5.25" r="4.3" fill="black" />
          </mask>
        </defs>
        <circle cx="8" cy="8" r="6.5" fill={PRESENCE_COLORS.idle} mask={`url(#${maskId}-idle)`} />
      </svg>}
      {presence === "dnd" && (hollowDnd ? (
        <svg aria-hidden="true" viewBox="0 0 16 16" width={iconSize} height={iconSize} className="shrink-0">
          <defs><mask id={`${maskId}-dnd`}><rect width="16" height="16" fill="white"/><rect x="4" y="7" width="8" height="2" rx="1" fill="black"/></mask></defs>
          <circle cx="8" cy="8" r="7.5" fill={PRESENCE_COLORS.dnd} mask={`url(#${maskId}-dnd)`}/>
        </svg>
      ) : <span aria-hidden="true" className="h-[2px] w-[55%] rounded-full" style={{ backgroundColor: dndBarColor }} />)}
      {presence === "offline" && <span aria-hidden="true" className="h-[46%] w-[46%] rounded-full" style={{ backgroundColor: cutoutColor }} />}
    </span>
  );
}
