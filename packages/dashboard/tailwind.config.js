/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: "#0a0a0f",
          card: "#12121a",
          border: "#1e1e2e",
          accent: "#6366f1",
          green: "#22c55e",
          red: "#ef4444",
          yellow: "#eab308",
        },
      },
    },
  },
  plugins: [],
};
