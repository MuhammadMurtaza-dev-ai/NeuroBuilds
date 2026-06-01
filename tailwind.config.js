/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#0df2f2",
        "primary-dim": "rgba(13, 242, 242, 0.1)",
        "accent-purple": "#bf00ff",
        "bg-dark": "var(--bg-dark)",
        "bg-panel": "var(--bg-panel)",
        "border-glass": "var(--border-glass)",
        "code-bg": "#0d0d0d",
        "text-base": "var(--text-base)",
        "text-muted": "var(--text-muted)",
      },
      fontFamily: {
        "display": ["Space Grotesk", "sans-serif"],
        "mono": ["monospace"],
      },
      borderRadius: {
        "bento": "2rem",
        "pill": "9999px",
      },
      boxShadow: {
        "neon": "0 0 10px rgba(13, 242, 242, 0.3), 0 0 20px rgba(13, 242, 242, 0.1)",
        "glow-purple": "0 0 40px rgba(191, 0, 255, 0.15)",
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
  darkMode: 'class',
}
