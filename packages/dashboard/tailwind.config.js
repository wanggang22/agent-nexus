/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: "#06060b",
          card: "#0d0d15",
          "card-hover": "#13131f",
          border: "#1a1a2e",
          "border-hover": "#2a2a4e",
          accent: "#7c3aed",
          "accent-light": "#a78bfa",
          "accent-glow": "rgba(124, 58, 237, 0.15)",
          green: "#10b981",
          red: "#ef4444",
          yellow: "#f59e0b",
          muted: "#64748b",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(ellipse at top, var(--tw-gradient-stops))",
        "hero-glow": "radial-gradient(600px circle at 50% 0%, rgba(124, 58, 237, 0.12), transparent 70%)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 20px rgba(124, 58, 237, 0.1)" },
          "100%": { boxShadow: "0 0 40px rgba(124, 58, 237, 0.25)" },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
