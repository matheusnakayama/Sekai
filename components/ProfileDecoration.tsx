"use client";

import { useId, type ReactNode } from "react";
import { PROFILE_DECORATIONS, profileDecorationById, type ProfileDecorationId } from "@/lib/profileDecorations";
import { cn } from "@/lib/utils";

function TopArt({ children, tall = false }: { children: ReactNode; tall?: boolean }) {
  return (
    <svg viewBox="0 0 320 150" className={cn("absolute inset-x-0 top-0 w-full", tall ? "h-[168px]" : "h-[132px]")} aria-hidden="true">
      {children}
    </svg>
  );
}

function Solara() {
  const id = useId().replace(/:/g, "");
  return (
    <TopArt tall>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset="0.45" stopColor="#f0b429" />
          <stop offset="1" stopColor="#a86a12" />
        </linearGradient>
      </defs>
      <path d="M18 128 C18 36 58 10 160 10 C262 10 302 36 302 128" fill="none" stroke={`url(#${id})`} strokeWidth="7" />
      <path d="M34 128 C36 52 70 24 160 24 C250 24 284 52 286 128" fill="none" stroke="#ffe7a3" strokeWidth="1.5" opacity="0.8" />
      <g transform="translate(160 16)">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <rect key={angle} x="-2" y="-22" width="4" height="10" rx="1" fill="#ffe08a" transform={`rotate(${angle})`} />
        ))}
        <circle r="11" fill="#ffd76a" stroke="#fff6d2" strokeWidth="2" />
        <circle r="4" fill="#fff8df" />
      </g>
      {[28, 292].map((x) => (
        <g key={x}>
          <path d={`M${x} 28 v18`} stroke="#f0b429" strokeWidth="1.5" />
          <polygon points={`${x},50 ${x - 5},62 ${x},74 ${x + 5},62`} fill="#ffd76a" stroke="#a86a12" strokeWidth="1" />
          <circle cx={x} cy="86" r="3.5" fill="#fff" />
          <circle cx={x} cy="96" r="2.4" fill="#f0b429" />
        </g>
      ))}
    </TopArt>
  );
}

function Sakura() {
  const flower = (x: number, y: number, scale: number, key: string) => (
    <g key={key} transform={`translate(${x} ${y}) scale(${scale})`}>
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse key={angle} cx="0" cy="-8" rx="4.2" ry="7" fill="#ffb7c8" transform={`rotate(${angle})`} />
      ))}
      <circle r="2.4" fill="#ffe08a" />
    </g>
  );
  return (
    <TopArt>
      <path d="M8 78 C40 70 52 40 78 28" fill="none" stroke="#d7b08a" strokeWidth="2" />
      <path d="M312 70 C278 64 262 36 236 22" fill="none" stroke="#d7b08a" strokeWidth="2" />
      {flower(78, 28, 1, "a")}
      {flower(54, 58, 0.72, "b")}
      {flower(236, 24, 1.05, "c")}
      {flower(268, 52, 0.68, "d")}
      {flower(160, 18, 0.55, "e")}
    </TopArt>
  );
}

function Neon() {
  const raw = useId().replace(/:/g, "");
  const line = `${raw}-line`;
  const glow = `${raw}-glow`;
  return (
    <TopArt>
      <defs>
        <linearGradient id={line} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2ee6ff" />
          <stop offset="1" stopColor="#ff4fd8" />
        </linearGradient>
        <filter id={glow}>
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g fill="none" stroke={`url(#${line})`} strokeWidth="3" filter={`url(#${glow})`}>
        <path d="M18 46 h28 M18 46 v28" />
        <path d="M302 46 h-28 M302 46 v28" />
        <path d="M18 118 h36 M302 118 h-36" />
      </g>
      <circle cx="160" cy="28" r="5" fill="#2ee6ff" />
      <circle cx="176" cy="28" r="3" fill="#ff4fd8" />
    </TopArt>
  );
}

function Loto() {
  return (
    <TopArt>
      <ellipse cx="108" cy="108" rx="34" ry="12" fill="#1f8a62" opacity="0.9" />
      <ellipse cx="214" cy="112" rx="28" ry="10" fill="#146b4c" />
      <g transform="translate(168 78)">
        {[0, 51, 102, 153, 204, 255, 306].map((angle) => (
          <ellipse key={angle} cx="0" cy="-16" rx="7" ry="16" fill="#f3a7c4" transform={`rotate(${angle})`} />
        ))}
        <circle r="6" fill="#ffe08a" />
      </g>
      <path d="M20 124 C70 112 120 130 170 118 C220 106 270 124 310 112" fill="none" stroke="#8fd6ff" strokeWidth="1.5" opacity="0.7" />
    </TopArt>
  );
}

function Brasa() {
  return (
    <TopArt tall>
      <g fill="#ff7a3c">
        <path d="M58 118 C52 96 70 88 64 68 C78 84 86 78 80 58 C98 86 92 104 86 118 Z" />
        <path d="M86 122 C82 104 96 98 92 82 C104 98 112 94 108 78 C122 102 114 114 108 122 Z" opacity="0.85" />
      </g>
      <g fill="#ffd27a">
        {[[40, 70], [108, 48], [132, 86], [96, 36], [150, 64]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={y < 50 ? 2 : 2.6} />
        ))}
      </g>
      <path d="M250 40 C258 58 246 70 258 90" fill="none" stroke="#ff8a4a" strokeWidth="2" />
      <circle cx="262" cy="96" r="3" fill="#ffd27a" />
    </TopArt>
  );
}

function Aurora() {
  const raw = useId().replace(/:/g, "");
  const first = `${raw}-a`;
  const second = `${raw}-b`;
  return (
    <TopArt>
      <defs>
        <linearGradient id={first} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7dffb3" stopOpacity="0" />
          <stop offset="0.4" stopColor="#7dffb3" />
          <stop offset="1" stopColor="#7aa2ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={second} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c084fc" stopOpacity="0" />
          <stop offset="0.5" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#c084fc" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M10 48 C70 10 130 78 190 36 C240 8 280 40 314 22" fill="none" stroke={`url(#${first})`} strokeWidth="8" strokeLinecap="round" />
      <path d="M8 72 C80 40 140 96 210 58 C260 32 290 70 316 48" fill="none" stroke={`url(#${second})`} strokeWidth="5" strokeLinecap="round" />
      <path d="M24 96 C90 70 150 110 230 78" fill="none" stroke="#d8b4fe" strokeWidth="2" opacity="0.8" />
    </TopArt>
  );
}

function Estrelas() {
  return (
    <TopArt>
      <polyline points="36,88 62,46 96,70 132,28 168,64" fill="none" stroke="#dbe7ff" strokeWidth="1.2" opacity="0.8" />
      <polyline points="188,40 214,72 252,34 286,58" fill="none" stroke="#dbe7ff" strokeWidth="1.2" opacity="0.75" />
      {[[36, 88, 2.2], [62, 46, 3], [96, 70, 2], [132, 28, 3.4], [168, 64, 2.2], [188, 40, 2.4], [214, 72, 2], [252, 34, 3.2], [286, 58, 2.2], [150, 96, 1.6], [240, 96, 1.5]].map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff8df" />
      ))}
    </TopArt>
  );
}

function Geada() {
  const crystal = (x: number, y: number, scale: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${scale})`}>
      <polygon points="0,-16 6,0 0,16 -6,0" fill="#d7f4ff" stroke="#8fd4ee" strokeWidth="1" />
      <polygon points="0,-8 3,0 0,8 -3,0" fill="#ffffff" />
    </g>
  );
  return (
    <TopArt>
      {crystal(36, 46, 1.15)}
      {crystal(58, 78, 0.7)}
      {crystal(284, 42, 1)}
      {crystal(258, 74, 0.65)}
      {crystal(160, 24, 0.55)}
      <path d="M20 112 C40 100 48 118 70 108" fill="none" stroke="#bfefff" strokeWidth="1.4" />
      <path d="M250 108 C272 118 280 98 302 112" fill="none" stroke="#bfefff" strokeWidth="1.4" />
    </TopArt>
  );
}

function Realeza() {
  return (
    <TopArt tall>
      <g transform="translate(64 18)" fill="#ffd76a" stroke="#a86a12" strokeWidth="1">
        <path d="M4 28 L10 10 L18 22 L26 4 L34 22 L42 10 L48 28 Z" />
        <rect x="4" y="28" width="44" height="6" rx="1" />
        <circle cx="26" cy="6" r="2" fill="#fff" />
      </g>
      <path d="M18 96 C28 78 40 92 52 74" fill="none" stroke="#f0b429" strokeWidth="2" />
      <path d="M268 74 C280 92 292 78 304 98" fill="none" stroke="#f0b429" strokeWidth="2" />
      <circle cx="52" cy="72" r="3" fill="#fff1c2" />
      <circle cx="268" cy="72" r="3" fill="#fff1c2" />
    </TopArt>
  );
}

function Eye({ className }: { className?: string }) {
  return (
    <span className={cn("relative block h-3.5 w-6", className)}>
      <span className="absolute inset-0 rounded-[50%] border border-white/80 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#16181d]" />
    </span>
  );
}

function Vigilia() {
  return (
    <>
      <span className="absolute inset-x-2 top-1.5 flex items-center justify-between">
        {Array.from({ length: 8 }, (_, index) => <Eye key={`top-${index}`} className={index % 3 === 0 ? "h-4 w-7" : undefined} />)}
      </span>
      <span className="absolute inset-x-3 bottom-1.5 flex items-center justify-between">
        {Array.from({ length: 8 }, (_, index) => <Eye key={`bottom-${index}`} />)}
      </span>
      <span className="absolute bottom-10 left-1 top-10 flex flex-col justify-between">
        {Array.from({ length: 4 }, (_, index) => <Eye key={`left-${index}`} />)}
      </span>
      <span className="absolute bottom-10 right-1 top-10 flex flex-col justify-between">
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
        <span className="relative block h-16 overflow-hidden rounded-lg bg-[#17181c]">
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
          <span className="relative block h-16 overflow-hidden rounded-lg bg-[#2a2118]">
            <span className="absolute inset-x-0 top-0 h-8 bg-gradient-to-r from-[#3a2a22] to-[#1c2430]" />
            <ProfileDecoration id={item.id} />
          </span>
          <span className="mt-2 block text-xs font-semibold text-discord-header-primary">{item.name}</span>
          <span className="block truncate text-[10px] text-discord-text-muted">{item.description}</span>
        </button>
      ))}
    </div>
  );
}
