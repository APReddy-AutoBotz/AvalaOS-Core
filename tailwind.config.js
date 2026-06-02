/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#002C4B',
          hover: '#073B60',
          dark: '#001B2F',
        },
        'abz-primary': '#002C4B',
        abz: {
          indigo: { 100: '#E6EEF4', 500: '#002C4B', 600: '#073B60', 700: '#001B2F' },
          teal: { 400: '#2DD4BF', 500: '#14B8A6', 600: '#0D9488' },
          amber: { 500: '#FFBC03' },
          red: { 500: '#EF4444' },
          emerald: { 500: '#10B981' },
          violet: { 500: '#8B5CF6' },
          azure: { 500: '#2563EB' },
          pink: { 500: '#EC4899' },
          slate: { 500: '#64748B' },
          ink: { 800: '#073B60', 900: '#002C4B', 950: '#001B2F' },
          cloud: { 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0' },
        },
        'surface-dark': '#0B1424',
        'text-light': '#0F172A',
        'text-dark': '#F8FAFC',
      },
      borderRadius: { xl: '1rem', '2xl': '1.25rem', '3xl': '1.5rem' },
      boxShadow: {
        soft: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        elev1: '0 1px 2px rgba(0,0,0,0.06)',
        elev2: '0 10px 24px rgba(0,0,0,.08)',
        elev3: '0 14px 34px rgba(0,0,0,0.12)',
      },
      ringWidth: { 3: '3px' },
      ringColor: { DEFAULT: '#6366F1' },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        glow: {
          '0%,100%': { boxShadow: '0 0 0 rgba(99,102,241,0)' },
          '50%': { boxShadow: '0 0 24px rgba(99,102,241,0.35)' },
        },
      },
      animation: {
        shimmer: 'shimmer 8s linear infinite',
        glow: 'glow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
