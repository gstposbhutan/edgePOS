import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#0F172A",
        gold: "#D4AF37",
        emerald: "#10B981",
        tibetan: "#EF4444",
      },
      fontFamily: {
        sans: ["var(--font-noto-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-noto-serif)", "serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-gold": "pulse-gold 2s infinite",
        "success-flash": "success-flash 0.5s ease-out",
        "error-shake": "error-shake 0.5s ease-out",
      },
      keyframes: {
        "pulse-gold": {
          "0%, 100%": {
            borderColor: "oklch(0.68 0.15 85)",
            boxShadow: "0 0 0 0 rgba(212, 175, 55, 0.7)",
          },
          "50%": {
            borderColor: "oklch(0.75 0.18 85)",
            boxShadow: "0 0 0 8px rgba(212, 175, 55, 0)",
          },
        },
        "success-flash": {
          "0%": {
            backgroundColor: "oklch(0.52 0.15 145)",
            transform: "scale(1.05)",
          },
          "100%": {
            backgroundColor: "transparent",
            transform: "scale(1)",
          },
        },
        "error-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "75%": { transform: "translateX(4px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;