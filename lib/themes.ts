export interface ThemeOption {
  id: string;
  name: string;
  stops: string[]; // 7 cores do gradiente, da mais clara para a mais escura
  backgroundStops?: [string, string]; // o fundo usa apenas duas cores
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
  { id: "sakura", name: "Sakura", stops: ["#ffe4ec", "#fbcfe8", "#f9a8d4", "#ec4899", "#db2777", "#be185d", "#831843"], backgroundStops: ["#db2777", "#4a1534"] },
  { id: "celeste", name: "Celeste", stops: ["#e0f7ff", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0369a1", "#0c3455"], backgroundStops: ["#0284c7", "#102d49"] },
  { id: "esmeralda", name: "Esmeralda", stops: ["#d1fae5", "#a7f3d0", "#6ee7b7", "#10b981", "#059669", "#047857", "#064e3b"], backgroundStops: ["#059669", "#10392f"] },
  { id: "caramelo", name: "Caramelo", stops: ["#fef3c7", "#fde68a", "#fbbf24", "#d97706", "#b45309", "#92400e", "#451a03"], backgroundStops: ["#b45309", "#392315"] },
  { id: "ameixa-real", name: "Ameixa real", stops: ["#f3e8ff", "#e9d5ff", "#c084fc", "#9333ea", "#7e22ce", "#6b21a8", "#3b0764"], backgroundStops: ["#7e22ce", "#291741"] },
  { id: "laguna", name: "Laguna", stops: ["#ccfbf1", "#99f6e4", "#5eead4", "#14b8a6", "#0d9488", "#0f766e", "#134e4a"], backgroundStops: ["#0f766e", "#153b40"] },
  { id: "meia-noite", name: "Meia-noite", stops: ["#dbeafe", "#bfdbfe", "#93c5fd", "#3b82f6", "#2563eb", "#1d4ed8", "#172554"], backgroundStops: ["#1d4ed8", "#111d3b"] },
  { id: "pessego", name: "Pêssego", stops: ["#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#c2410c", "#7c2d12"], backgroundStops: ["#ea580c", "#43251e"] },
  { id: "prata", name: "Prata", stops: ["#f8fafc", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#1e293b"], backgroundStops: ["#64748b", "#252c38"] },
  { id: "floresta", name: "Floresta", stops: ["#ecfccb", "#d9f99d", "#a3e635", "#65a30d", "#4d7c0f", "#3f6212", "#1a2e05"], backgroundStops: ["#4d7c0f", "#263322"] },
  { id: "noite-rosada", name: "Noite rosada", stops: ["#fce7f3", "#f9a8d4", "#ec4899", "#db2777", "#a21caf", "#581c52", "#24152a"], backgroundStops: ["#49243e", "#17131e"] },
  { id: "aurora-boreal", name: "Aurora boreal", stops: ["#d1fae5", "#99f6e4", "#2dd4bf", "#14b8a6", "#0e7490", "#164e63", "#10263c"], backgroundStops: ["#17464b", "#111c2d"] },
  { id: "violeta-eletrico", name: "Violeta elétrico", stops: ["#f3e8ff", "#ddd6fe", "#a78bfa", "#7c3aed", "#6d28d9", "#4c1d95", "#21123d"], backgroundStops: ["#392354", "#171321"] },
  { id: "rubi-sombra", name: "Rubi sombra", stops: ["#fee2e2", "#fca5a5", "#ef4444", "#dc2626", "#991b1b", "#64152e", "#280f1d"], backgroundStops: ["#481d2c", "#1b111a"] },
  { id: "oceano-profundo", name: "Oceano profundo", stops: ["#cffafe", "#67e8f9", "#22d3ee", "#0891b2", "#155e75", "#164e63", "#082f49"], backgroundStops: ["#123d52", "#101923"] },
  { id: "lavanda-nevoa", name: "Lavanda névoa", stops: ["#faf5ff", "#e9d5ff", "#c4b5fd", "#8b5cf6", "#6d28d9", "#4c1d95", "#211735"], backgroundStops: ["#38284f", "#191522"] },
  { id: "oliva-dourada", name: "Oliva dourada", stops: ["#fef9c3", "#e9d5a5", "#c5c873", "#879747", "#667534", "#46552c", "#202c20"], backgroundStops: ["#363c2d", "#191c18"] },
  { id: "cobre", name: "Cobre", stops: ["#ffedd5", "#fdba74", "#fb923c", "#c96b43", "#9a4d46", "#603b45", "#2e2437"], backgroundStops: ["#49303a", "#1d1924"] },
  { id: "iceberg", name: "Iceberg", stops: ["#f0f9ff", "#bae6fd", "#7dd3fc", "#38bdf8", "#2563eb", "#1e40af", "#14224a"], backgroundStops: ["#20334e", "#121722"] },
  { id: "flamingo", name: "Flamingo", stops: ["#fff1f2", "#fecdd3", "#fb7185", "#f43f5e", "#be123c", "#881337", "#3f1028"], backgroundStops: ["#502031", "#1d131c"] },
  { id: "mentol", name: "Mentol", stops: ["#ecfccb", "#bef264", "#84cc16", "#22c55e", "#059669", "#0f766e", "#164e63"], backgroundStops: ["#1c473f", "#111f25"] },
  { id: "ametista", name: "Ametista", stops: ["#f5d0fe", "#e879f9", "#c026d3", "#9333ea", "#6b21a8", "#4c1d95", "#1f1639"], backgroundStops: ["#3b2554", "#181421"] },
  { id: "champanhe", name: "Champanhe", stops: ["#fff7ed", "#fed7aa", "#fbbf24", "#d97706", "#a55b2a", "#693f36", "#2a2932"], backgroundStops: ["#42322b", "#1e1d20"] },
  { id: "tropical", name: "Tropical", stops: ["#d1fae5", "#6ee7b7", "#34d399", "#14b8a6", "#0e7490", "#1d4ed8", "#312e81"], backgroundStops: ["#164a52", "#171a35"] },
  { id: "neon-cereja", name: "Neon cereja", stops: ["#ffe4e6", "#fda4af", "#fb7185", "#e11d48", "#c026d3", "#7e22ce", "#32185a"], backgroundStops: ["#4b2039", "#1b1423"] },
];
