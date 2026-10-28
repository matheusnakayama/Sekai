"use client";

import { useId, type ReactNode } from "react";
import { PROFILE_DECORATIONS, profileDecorationById, type ProfileDecorationId } from "@/lib/profileDecorations";
import { cn } from "@/lib/utils";

function Frame({ children, border }: { children?: ReactNode; border: string }) {
  return (
    <>
      <span className="absolute inset-[5px] rounded-[14px] border-2" style={{ borderColor: border, boxShadow: `inset 0 0 0 1px ${border}` }} />
      {children}
    </>
  );
}

function Solara() {
  const id = useId().replace(/:/g, "");
  return (
    <Frame border="rgba(240,180,41,.92)">
      <svg viewBox="0 0 64 64" className="absolute left-1/2 top-0 h-11 w-11 -translate-x-1/2" aria-hidden="true">
        <defs>
          <radialGradient id={id} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff6d0" />
            <stop offset="0.55" stopColor="#ffd76a" />
            <stop offset="1" stopColor="#e0a11a" />
          </radialGradient>
        </defs>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <rect key={angle} x="30" y="4" width="4" height="10" rx="1" fill="#ffe7a3" transform={`rotate(${angle} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="11" fill={`url(#${id})`} stroke="#fff4cc" strokeWidth="2" />
      </svg>
      <svg viewBox="0 0 28 78" className="absolute left-2 top-3 h-[72px] w-6" aria-hidden="true">
        <path d="M14 0 v16" stroke="#f0b429" strokeWidth="1.6" />
        <polygon points="14,18 8,30 14,42 20,30" fill="#ffd76a" stroke="#a86a12" strokeWidth="1" />
        <circle cx="14" cy="52" r="3.2" fill="#fff8e4" />
        <circle cx="14" cy="64" r="2.2" fill="#f0b429" />
      </svg>
      <svg viewBox="0 0 28 78" className="absolute right-2 top-16 h-[72px] w-6" aria-hidden="true">
        <path d="M14 0 v16" stroke="#f0b429" strokeWidth="1.6" />
        <polygon points="14,18 8,30 14,42 20,30" fill="#ffd76a" stroke="#a86a12" strokeWidth="1" />
        <circle cx="14" cy="52" r="3.2" fill="#fff8e4" />
        <circle cx="14" cy="64" r="2.2" fill="#f0b429" />
      </svg>
    </Frame>
  );
}

function Flower({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse key={angle} cx="0" cy="-7" rx="3.6" ry="6.2" fill="#ffb7c8" stroke="#e889a4" strokeWidth="0.4" transform={`rotate(${angle})`} />
      ))}
      <circle r="2.1" fill="#ffe08a" />
    </g>
  );
}

function Sakura() {
  return (
    <Frame border="rgba(255,183,200,.78)">
      <svg viewBox="0 0 120 86" className="absolute left-0 top-0 h-[78px] w-[108px]" aria-hidden="true">
        <path d="M8 8 C28 18 36 34 34 58" fill="none" stroke="#d7b08a" strokeWidth="2" />
        <Flower x={34} y={22} scale={1.15} />
        <Flower x={58} y={14} scale={0.82} />
        <Flower x={18} y={40} scale={0.7} />
      </svg>
      <svg viewBox="0 0 120 86" className="absolute right-0 top-14 h-[72px] w-[96px] -scale-x-100" aria-hidden="true">
        <path d="M8 8 C28 18 36 34 34 58" fill="none" stroke="#d7b08a" strokeWidth="2" />
        <Flower x={34} y={22} scale={1.05} />
        <Flower x={62} y={16} scale={0.72} />
      </svg>
    </Frame>
  );
}

function Neon() {
  const raw = useId().replace(/:/g, "");
  const line = `${raw}-line`;
  const corners = [
    "left-1.5 top-1.5",
    "right-1.5 top-1.5 rotate-90",
    "bottom-1.5 right-1.5 rotate-180",
    "bottom-1.5 left-1.5 -rotate-90",
  ];
  return (
    <>
      <span className="absolute inset-[6px] rounded-[14px] border border-cyan-300/70 shadow-[0_0_12px_rgba(46,230,255,.35),inset_0_0_12px_rgba(255,79,216,.18)]" />
      {corners.map((place, index) => (
        <svg key={place} viewBox="0 0 36 36" className={cn("absolute h-8 w-8", place)} aria-hidden="true">
          <defs>
            <linearGradient id={`${line}-${index}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2ee6ff" />
              <stop offset="1" stopColor="#ff4fd8" />
            </linearGradient>
          </defs>
          <path d="M4 28 V6 H28" fill="none" stroke={`url(#${line}-${index})`} strokeWidth="3" strokeLinecap="round" />
        </svg>
      ))}
    </>
  );
}

function Loto() {
  return (
    <Frame border="rgba(143,214,255,.45)">
      <svg viewBox="0 0 220 70" className="absolute bottom-1 left-1/2 h-16 w-[200px] -translate-x-1/2" aria-hidden="true">
        <path d="M8 48 C40 40 70 56 110 46 C150 36 180 52 212 42" fill="none" stroke="#8fd6ff" strokeWidth="2" />
        <ellipse cx="58" cy="50" rx="28" ry="9" fill="#1f8a62" />
        <ellipse cx="156" cy="52" rx="24" ry="8" fill="#146b4c" />
        <g transform="translate(110 30)">
          {[0, 51, 102, 153, 204, 255, 306].map((angle) => (
            <ellipse key={angle} cx="0" cy="-12" rx="5.5" ry="12" fill="#f3a7c4" transform={`rotate(${angle})`} />
          ))}
          <circle r="4.5" fill="#ffe08a" />
        </g>
      </svg>
    </Frame>
  );
}

function Brasa() {
  return (
    <Frame border="rgba(255,122,60,.55)">
      <svg viewBox="0 0 90 80" className="absolute bottom-1 left-1 h-[72px] w-[84px]" aria-hidden="true">
        <path d="M28 74 C22 54 38 46 32 28 C46 44 54 38 48 18 C64 42 58 58 52 74 Z" fill="#ff7a3c" />
        <path d="M48 76 C44 60 56 54 52 40 C64 54 72 50 68 36 C80 56 74 68 68 76 Z" fill="#ffb15a" />
        <path d="M40 70 C38 58 46 54 44 44 C52 54 56 52 54 42 C62 56 58 66 54 70 Z" fill="#ffe08a" />
      </svg>
      <svg viewBox="0 0 70 40" className="absolute right-3 top-2 h-8 w-16" aria-hidden="true">
        {[[8, 28], [22, 14], [36, 24], [52, 10], [62, 22]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={y < 16 ? 2.2 : 1.6} fill="#ffd27a" />
        ))}
      </svg>
    </Frame>
  );
}

function Aurora() {
  const raw = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 400 32" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-7 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${raw}-a`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7dffb3" stopOpacity="0" />
          <stop offset="0.35" stopColor="#7dffb3" />
          <stop offset="1" stopColor="#7aa2ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${raw}-b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c084fc" stopOpacity="0" />
          <stop offset="0.5" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#c084fc" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 10 C80 2 140 22 220 8 C300 0 360 16 400 6" fill="none" stroke={`url(#${raw}-a)`} strokeWidth="7" strokeLinecap="round" />
      <path d="M0 22 C90 12 160 28 250 16 C320 8 370 20 400 14" fill="none" stroke={`url(#${raw}-b)`} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function Estrelas() {
  const stars = [
    [8, 18], [18, 8], [30, 16], [42, 7], [54, 18], [66, 9], [78, 17], [90, 8],
  ];
  return (
    <div className="absolute inset-x-3 top-1.5 flex items-start justify-between">
      {stars.map(([x, y], index) => (
        <span key={`${x}-${y}`} className="relative block h-5 w-5">
          {index < stars.length - 1 && <span className="absolute left-2 top-2 h-px w-8 bg-white/50" />}
          <span className="absolute rounded-full bg-[#fff8df] shadow-[0_0_6px_#fff]" style={{ width: index % 3 === 0 ? 7 : 4, height: index % 3 === 0 ? 7 : 4, left: 4, top: y > 12 ? 10 : 2 }} />
        </span>
      ))}
    </div>
  );
}

function Geada() {
  const crystal = (className: string) => (
    <svg viewBox="0 0 70 78" className={className} aria-hidden="true">
      <polygon points="22,8 30,28 22,48 14,28" fill="#d7f4ff" stroke="#8fd4ee" strokeWidth="1" />
      <polygon points="40,22 48,40 40,58 32,40" fill="#ffffff" stroke="#bfefff" strokeWidth="1" />
      <polygon points="18,36 24,48 18,60 12,48" fill="#e7fbff" stroke="#8fd4ee" strokeWidth="1" />
    </svg>
  );
  return (
    <Frame border="rgba(191,239,255,.7)">
      <span className="absolute left-1 top-1">{crystal("h-[70px] w-16")}</span>
      <span className="absolute right-1 top-1">{crystal("h-[70px] w-16 -scale-x-100")}</span>
    </Frame>
  );
}

function Realeza() {
  return (
    <Frame border="rgba(240,180,41,.9)">
      <svg viewBox="0 0 78 40" className="absolute left-1/2 top-0 h-9 w-[72px] -translate-x-1/2" aria-hidden="true">
        <path d="M6 32 L14 12 L26 24 L39 4 L52 24 L64 12 L72 32 Z" fill="#ffd76a" stroke="#a86a12" strokeWidth="1.4" />
        <rect x="6" y="30" width="66" height="7" rx="1.5" fill="#f0b429" stroke="#a86a12" />
        <circle cx="39" cy="8" r="2.2" fill="#fff" />
        <circle cx="14" cy="16" r="1.6" fill="#fff6d2" />
        <circle cx="64" cy="16" r="1.6" fill="#fff6d2" />
      </svg>
    </Frame>
  );
}

function Eye({ className }: { className?: string }) {
  return (
    <span className={cn("relative block h-3.5 w-6 shrink-0", className)}>
      <span className="absolute inset-0 rounded-[50%] border border-black/50 bg-white shadow-[0_0_0_1px_rgba(255,255,255,.35)]" />
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#16181d]" />
      <span className="absolute left-[58%] top-[32%] h-1 w-1 rounded-full bg-white" />
    </span>
  );
}

function Vigilia() {
  return (
    <>
      <span className="absolute inset-x-1 top-1 flex items-center justify-between gap-1 rounded-t-xl bg-black/45 px-1 py-0.5">
        {Array.from({ length: 9 }, (_, index) => <Eye key={`top-${index}`} className={index % 3 === 1 ? "h-4 w-7" : undefined} />)}
      </span>
      <span className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded-b-xl bg-black/45 px-1 py-0.5">
        {Array.from({ length: 9 }, (_, index) => <Eye key={`bottom-${index}`} />)}
      </span>
      <span className="absolute bottom-8 left-1 top-8 flex w-6 flex-col items-center justify-between bg-black/35 py-1">
        {Array.from({ length: 4 }, (_, index) => <Eye key={`left-${index}`} />)}
      </span>
      <span className="absolute bottom-8 right-1 top-8 flex w-6 flex-col items-center justify-between bg-black/35 py-1">
        {Array.from({ length: 4 }, (_, index) => <Eye key={`right-${index}`} />)}
      </span>
    </>
  );
}

const ARTS: Record<ProfileDecorationId, () => ReactNode> = {
  solara: Solara,
  vigilia: Vigilia,
  sakura: Sakura,
  neon: Neon,
  loto: Loto,
  brasa: Brasa,
  aurora: Aurora,
  estrelas: Estrelas,
  geada: Geada,
  realeza: Realeza,
};

export function ProfileDecoration({ id, className }: { id?: string | null; className?: string }) {
  const decoration = profileDecorationById(id);
  if (!decoration) return null;
  const Art = ARTS[decoration.id];
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 z-[6] overflow-hidden", className)}>
      <Art />
    </div>
  );
}

export function ProfileDecorationPicker({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (id: ProfileDecorationId | null) => void;
}) {
  const selected = profileDecorationById(value)?.id ?? null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <button
        type="button"
        aria-pressed={selected === null}
        onClick={() => onChange(null)}
        className={cn(
          "overflow-hidden rounded-xl border p-2 text-left transition",
          selected === null ? "border-discord-brand bg-discord-brand/10" : "border-white/10 hover:bg-white/[0.04]",
        )}
      >
        <span className="relative block h-[92px] overflow-hidden rounded-lg bg-[#17181c]">
          <span className="absolute inset-x-0 top-0 h-9 bg-[#2b2d31]" />
          <span className="absolute bottom-3 left-3 h-7 w-7 rounded-full border-2 border-[#17181c] bg-[#5865f2]" />
          <span className="absolute inset-0 grid place-items-center text-[11px] text-discord-text-muted">Sem decoração</span>
        </span>
        <span className="mt-2 block text-xs font-semibold text-discord-header-primary">Nenhuma</span>
      </button>
      {PROFILE_DECORATIONS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={selected === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "overflow-hidden rounded-xl border p-2 text-left transition",
            selected === item.id ? "border-discord-brand bg-discord-brand/10" : "border-white/10 hover:bg-white/[0.04]",
          )}
        >
          <span className="relative block h-[92px] overflow-hidden rounded-lg bg-[#1e1f22]">
            <span className="absolute inset-x-0 top-0 h-9 bg-gradient-to-r from-[#3a2a22] to-[#243044]" />
            <span className="absolute bottom-3 left-3 h-7 w-7 rounded-full border-2 border-[#1e1f22] bg-[#5865f2]" />
            <ProfileDecoration id={item.id} />
          </span>
          <span className="mt-2 block text-xs font-semibold text-discord-header-primary">{item.name}</span>
          <span className="block truncate text-[10px] text-discord-text-muted">{item.description}</span>
        </button>
      ))}
    </div>
  );
}
