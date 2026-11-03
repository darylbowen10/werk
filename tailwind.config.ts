import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { pixel: ['"Press Start 2P"', "monospace"], body: ['"VT323"', "monospace"], ui: ["Inter", "system-ui", "sans-serif"] },
      colors: {
        hq: { ink: "#1b1726", panel: "#262035", panel2: "#30283f", line: "#4a3f63", gold: "#f2c14e", teal: "#4fc1b0", rose: "#e8697d", sky: "#6fa8ff", cream: "#f7ecd5", mute: "#a89cc0" },
      },
    },
  },
  plugins: [],
} satisfies Config;
