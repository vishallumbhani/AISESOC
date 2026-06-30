/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1f2937",
        secondary: "#6366f1",
        danger: "#ef4444",
        success: "#10b981",
        warning: "#f59e0b",
      },
    },
  },
  plugins: [],
};