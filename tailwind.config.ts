import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1c1d29",
          soft: "#4a4c5e",
          faint: "#7b7d92",
        },
        paper: "#f4f5f8",
        panel: "#ffffff",
        line: "#e2e4ec",
        accent: {
          DEFAULT: "#d8742e",
          ink: "#b85a1c",
        },
        reel: {
          DEFAULT: "#4a4fbf",
          soft: "#ecedf9",
        },
        good: "#2f8f6a",
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
