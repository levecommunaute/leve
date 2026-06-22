import type { Config } from "tailwindcss";

const config = {
  theme: {
    extend: {
      colors: {
        or: "#D4A017",
        r: "#C0392B",
        vc: "#2ECC71",
        bl: "#4A90D9",
        vi: "#7B5EA7",
        no: "#080808",
        g1: "#0E0E0E",
        g2: "#141414",
        g3: "#1A1A1A",
        g4: "#222222",
        b: "#F5F0E8",
      },
      borderRadius: {
        DEFAULT: "2px",
        sm: "1px",
        md: "4px",
        lg: "4px",
        xl: "4px",
        "2xl": "4px",
        "3xl": "4px",
        full: "4px",
      },
      boxShadow: {
        sm: "none",
        DEFAULT: "none",
        md: "none",
        lg: "none",
        xl: "none",
      },
    },
  },
} satisfies Config;

export default config;
