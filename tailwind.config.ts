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
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          soft: "rgb(var(--surface-soft) / <alpha-value>)",
          card: "rgb(var(--surface-card) / <alpha-value>)",
          border: "rgb(var(--surface-border) / <alpha-value>)",
        },
        danger: "#ef4444",
        success: "#22c55e",
        warn: "#f59e0b",
        discord: {
          // Fundos (do mais escuro ao mais claro)
          "bg-darkest": "rgb(var(--d-darkest) / <alpha-value>)",  // barra de servidores
          "bg-dark": "rgb(var(--d-dark) / <alpha-value>)",     // sidebar de canais
          "bg-primary": "rgb(var(--d-primary) / <alpha-value>)",  // área de chat
          "bg-secondary": "rgb(var(--d-secondary) / <alpha-value>)",
          "bg-modifier-hover": "rgb(var(--d-hover) / <alpha-value>)",
          "bg-floating": "rgb(var(--d-floating) / <alpha-value>)",

          // Marca / destaque
          brand: "rgb(var(--d-brand) / <alpha-value>)",
          "brand-hover": "rgb(var(--d-brand-hover) / <alpha-value>)",

          // Texto
          "text-normal": "#dbdee1",
          "text-muted": "#949ba4",
          "text-link": "var(--sekai-link)",
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
