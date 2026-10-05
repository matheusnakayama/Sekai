import { useId } from "react";
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
  hollowSymbols = false,
}: {
  presence: Presence;
  size?: number;
  className?: string;
  borderColor?: string;
  cutoutColor?: string;
  hollowSymbols?: boolean;
}) {
  const maskId = useId().replace(/:/g, "");

  return (
    <span
      role="img"
      aria-label={PRESENCE_LABELS[presence]}
      title={PRESENCE_LABELS[presence]}
      className={cn("presence-indicator relative inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: hollowSymbols && (presence === "idle" || presence === "dnd") ? "transparent" : PRESENCE_COLORS[presence],
        borderColor: borderColor ?? "transparent",
        borderStyle: "solid",
      }}
    >
      {presence === "idle" && (hollowSymbols ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute inset-0 h-full w-full">
          <defs><mask id={`${maskId}-idle`}><rect width="24" height="24" fill="white"/><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6.5 6.5 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" fill="black"/></mask></defs>
          <circle cx="12" cy="12" r="11" fill={PRESENCE_COLORS.idle} mask={`url(#${maskId}-idle)`}/>
        </svg>
      ) : <Moon aria-hidden="true" className="h-[70%] w-[70%]" fill={cutoutColor} stroke={cutoutColor} strokeWidth={1} />)}
      {presence === "dnd" && (hollowSymbols ? (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="absolute inset-0 h-full w-full">
          <defs><mask id={`${maskId}-dnd`}><rect width="16" height="16" fill="white"/><rect x="4" y="7" width="8" height="2" rx="1" fill="black"/></mask></defs>
          <circle cx="8" cy="8" r="7.5" fill={PRESENCE_COLORS.dnd} mask={`url(#${maskId}-dnd)`}/>
        </svg>
      ) : <span aria-hidden="true" className="h-[2px] w-[55%] rounded-full bg-white" />)}
      {presence === "offline" && <span aria-hidden="true" className="h-[46%] w-[46%] rounded-full" style={{ backgroundColor: cutoutColor }} />}
    </span>
  );
}
