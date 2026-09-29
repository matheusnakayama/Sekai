import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "gg sans",
          "Whitney",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        discord: {
          // Fundos (do mais escuro ao mais claro)
          "bg-darkest": "#1e1f22",  // barra de servidores
          "bg-dark": "#2b2d31",     // sidebar de canais
          "bg-primary": "#313338",  // área de chat
          "bg-secondary": "#383a40",
          "bg-modifier-hover": "#35373c",
          "bg-floating": "#111214",

          // Marca / destaque
          brand: "#5865f2",
          "brand-hover": "#4752c4",

          // Texto
          "text-normal": "#dbdee1",
          "text-muted": "#949ba4",
          "text-link": "#00a8fc",
          "header-primary": "#f2f3f5",

          // Status
          online: "#23a55a",
          idle: "#f0b232",
          dnd: "#f23f43",
          offline: "#80848e",

          // Interações
          danger: "#da373c",
          "danger-hover": "#a12828",
        },
      },
      borderRadius: {
        discord: "8px",
      },
      keyframes: {
        "speaking-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(35,165,90,0.6)" },
          "50%": { boxShadow: "0 0 0 4px rgba(35,165,90,0.6)" },
        },
      },
      animation: {
        speaking: "speaking-ring 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
