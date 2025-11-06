import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf2f8',   // Very light pastel pink
          100: '#fce7f3',  // Light pastel pink
          200: '#fbcfe8',  // Light pink
          300: '#f9a8d4',  // Medium-light pink
          400: '#f48fb8',  // Medium pink
          500: '#f17ba8',  // Pastel pink (main)
          600: '#e06b98',  // Medium-dark pink
          700: '#c85a85',  // Dark pink
          800: '#a84d6f',  // Darker pink
          900: '#8a4059',  // Darkest pink
        },
      },
    },
  },
  plugins: [],
}
export default config

