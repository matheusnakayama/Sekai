export interface ThemeOption {
  id: string;
  name: string;
  stops: string[]; // 7 cores do gradiente, da mais clara para a mais escura
}

export const DEFAULT_THEME = "azul";
export const THEME_STORAGE_KEY = "sekai-theme";

export const THEMES: ThemeOption[] = [
  {
    "id": "azul",
    "name": "Azul",
    "stops": [
      "#8ea2fb",
      "#7a8bf8",
      "#6a76f5",
      "#5865f2",
      "#4650df",
      "#3840b8",
      "#2a316f"
    ]
  },
  {
    "id": "roxo",
    "name": "Roxo",
    "stops": [
      "#c084fc",
      "#a855f7",
      "#9333ea",
      "#7e22ce",
      "#6b21a8",
      "#581c87",
      "#3b0764"
    ]
  },
  {
    "id": "rosa",
    "name": "Rosa",
    "stops": [
      "#f472b6",
      "#ec4899",
      "#db2777",
      "#be185d",
      "#9d174d",
      "#831843",
      "#500724"
    ]
  },
  {
    "id": "verde",
    "name": "Verde",
    "stops": [
      "#4ade80",
      "#22c55e",
      "#16a34a",
      "#15803d",
      "#166534",
      "#14532d",
      "#052e16"
    ]
  },
  {
    "id": "ambar",
    "name": "Âmbar",
    "stops": [
      "#f59e0b",
      "#e08a0b",
      "#d97706",
      "#c2610c",
      "#b45309",
      "#92400e",
      "#78350f"
    ]
  },
  {
    "id": "ciano",
    "name": "Ciano",
    "stops": [
      "#22d3ee",
      "#06b6d4",
      "#0891b2",
      "#0e7490",
      "#155e75",
      "#164e63",
      "#083344"
    ]
  },
  {
    "id": "rubi",
    "name": "Rubi",
    "stops": [
      "#f87171",
      "#ef4444",
      "#dc2626",
      "#b91c1c",
      "#991b1b",
      "#7f1d1d",
      "#450a0a"
    ]
  },
  {
    "id": "preto",
    "name": "Preto",
    "stops": [
      "#e4e4e7",
      "#a1a1aa",
      "#71717a",
      "#52525b",
      "#3f3f46",
      "#27272a",
      "#18181b"
    ]
  },
  {
    "id": "menta",
    "name": "Menta",
    "stops": [
      "#6ee7b7",
      "#34d399",
      "#2dd4bf",
      "#14b8a6",
      "#0d9488",
      "#0f766e",
      "#134e4a"
    ]
  },
  {
    "id": "por-do-sol",
    "name": "Pôr do sol",
    "stops": [
      "#fb923c",
      "#f97316",
      "#ef4444",
      "#e11d48",
      "#be123c",
      "#9d174d",
      "#701a75"
    ]
  },
  {
    "id": "oceano",
    "name": "Oceano",
    "stops": [
      "#38bdf8",
      "#0ea5e9",
      "#0284c7",
      "#0369a1",
      "#1d4ed8",
      "#1e40af",
      "#1e3a8a"
    ]
  },
  {
    "id": "candy",
    "name": "Candy",
    "stops": [
      "#f472b6",
      "#ec4899",
      "#d946ef",
      "#a855f7",
      "#8b5cf6",
      "#6366f1",
      "#3b82f6"
    ]
  },
  {
    "id": "grafite",
    "name": "Grafite",
    "stops": [
      "#94a3b8",
      "#64748b",
      "#566579",
      "#475569",
      "#334155",
      "#1e293b",
      "#0f172a"
    ]
  },
  { id: "lavanda", name: "Lavanda", stops: ["#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#4c1d95"] },
  { id: "coral", name: "Coral", stops: ["#fecaca", "#fca5a5", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#881337"] },
  { id: "lima", name: "Lima", stops: ["#d9f99d", "#bef264", "#a3e635", "#84cc16", "#65a30d", "#4d7c0f", "#365314"] },
  { id: "turquesa", name: "Turquesa", stops: ["#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#134e4a"] },
  { id: "indigo", name: "Índigo", stops: ["#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#312e81"] },
  { id: "magenta", name: "Magenta", stops: ["#f5d0fe", "#e879f9", "#d946ef", "#c026d3", "#a21caf", "#86198f", "#701a75"] },
  { id: "lava", name: "Lava", stops: ["#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#7c2d12"] },
  { id: "aurora", name: "Aurora", stops: ["#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#064e3b"] },
  { id: "gelo", name: "Gelo", stops: ["#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#075985"] },
  { id: "ameixa", name: "Ameixa", stops: ["#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#831843"] },
  { id: "bronze", name: "Bronze", stops: ["#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#d97706", "#b45309", "#78350f"] },
  { id: "safira", name: "Safira", stops: ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e3a8a"] },
  { id: "neon", name: "Neon", stops: ["#d9f99d", "#a3e635", "#84cc16", "#22c55e", "#10b981", "#0d9488", "#115e59"] },
];
