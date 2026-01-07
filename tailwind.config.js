/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#121212',
          800: '#1e1e1e',
          700: '#2d2d2d',
          600: '#3d3d3d',
        },
        primary: {
          DEFAULT: '#ff0000',
          dark: '#cc0000',
          light: '#ff3333',
        }
      }
    },
  },
  plugins: [],
}
