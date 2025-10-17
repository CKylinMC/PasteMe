import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animated";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts,tsx,js,jsx}"],
  theme: {
    extend: {},
  },
  plugins: [animatePlugin],
} satisfies Config;
