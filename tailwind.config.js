/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand green (from the Golai logo #2FA24E) — primary actions & accents
        brand: {
          50: '#ECFAF0',
          100: '#D2F2DC',
          200: '#A7E5BB',
          300: '#71D293',
          400: '#43BA6C',
          500: '#2FA24E', // logo green
          600: '#23863E',
          700: '#1D6A33',
          800: '#1A542B',
          900: '#123B1F',
          DEFAULT: '#2FA24E',
        },
        // Deep brand navy (the logo dot) — dark surfaces / top bar
        navy: '#16203A',
        // Neutral text + dark surfaces (Swiss slate scale). ink-800 = brand navy.
        ink: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#16203A',
          900: '#0F172A',
          DEFAULT: '#16203A',
        },
        // Page backgrounds / muted fills
        cream: {
          DEFAULT: '#F8FAFC',
          dark: '#F1F5F9',
        },
        // Borders / hairlines / muted neutrals
        tan: {
          DEFAULT: '#E2E8F0',
          light: '#F1F5F9',
          dark: '#94A3B8',
        },
      },
      minHeight: { tap: '56px' }, // PRD 7.1: floor/gate operators, gloved hands
      minWidth: { tap: '56px' },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.10)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
