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
        brand: {
          50: "#f0f4ff",
          100: "#e0e9ff",
          200: "#c7d6fe",
          300: "#a4bbfc",
          400: "#7d98f8",
          500: "#5865f2",
          600: "#4650df",
          700: "#3840b8",
          800: "#30378f",
          900: "#2a316f",
        },
        surface: {
          DEFAULT: "#101218",
          soft: "#181b23",
          card: "#1c202a",
          border: "#323746",
        },
        danger: "#ef4444",
        success: "#22c55e",
        warn: "#f59e0b",
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
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(34,197,94,0.55)" },
          "100%": { boxShadow: "0 0 0 8px rgba(34,197,94,0)" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "speaking-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(35,165,90,0.6)" },
          "50%": { boxShadow: "0 0 0 4px rgba(35,165,90,0.6)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.25s ease-out",
        speaking: "speaking-ring 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
