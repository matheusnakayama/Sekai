import type { CSSProperties } from "react";
import { Moon } from "lucide-react";
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
}: {
  presence: Presence;
  size?: number;
  className?: string;
  borderColor?: string;
  cutoutColor?: string;
}) {
  return (
    <span
      role="img"
      aria-label={PRESENCE_LABELS[presence]}
      title={PRESENCE_LABELS[presence]}
      className={cn("presence-indicator relative inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: PRESENCE_COLORS[presence],
        borderColor: borderColor ?? "transparent",
        borderStyle: "solid",
        "--presence-cutout": cutoutColor,
      } as CSSProperties}
    >
      {presence === "idle" && <Moon aria-hidden="true" className="h-[70%] w-[70%]" fill={cutoutColor} stroke={cutoutColor} strokeWidth={1} />}
      {presence === "dnd" && <span aria-hidden="true" className="h-[2px] w-[55%] rounded-full bg-white" />}
      {presence === "offline" && <span aria-hidden="true" className="h-[46%] w-[46%] rounded-full" style={{ backgroundColor: cutoutColor }} />}
    </span>
  );
}
