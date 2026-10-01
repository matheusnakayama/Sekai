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
  }
];
