/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5e8e0',
          100: '#ebd1c1',
          200: '#d7a383',
          300: '#c37545',
          400: '#B85C38', // Primary - warm terracotta
          500: '#a64f2e',
          600: '#944225',
          700: '#82351c',
          800: '#702813',
          900: '#5e1b0a',
        },
        accent: {
          50: '#fef9f0',
          100: '#fdf3e1',
          200: '#fbe7c3',
          300: '#f9dba5',
          400: '#F6C28B', // Accent - buttery beige
          500: '#f4b66d',
          600: '#f2aa4f',
          700: '#f09e31',
          800: '#ee9213',
          900: '#ec8600',
        },
        background: {
          DEFAULT: '#FFF9F4', // Off-white parchment
        },
        text: {
          DEFAULT: '#3B2F2F', // Dark brown text
        },
        highlight: {
          DEFAULT: '#D9A441', // Honey gold
        },
      },
    },
  },
  plugins: [],
}

