/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cine-bg': '#05000d',
        'cine-panel': '#0e0e1061',
        'cine-accent': '#95ff50',
      }
    },
  },
  plugins: [],
}
