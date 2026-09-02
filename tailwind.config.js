/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#08090a",
        surface: "rgba(255, 255, 255, 0.04)",
        glass: "rgba(18, 20, 24, 0.65)",
      },
    },
  },
  plugins: [],
}
