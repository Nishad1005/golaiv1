/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#2C1E0F',
          50: '#F7F3EE',
          100: '#EAE0D3',
          200: '#D3BFA5',
          300: '#B99A73',
          400: '#96733F',
          500: '#6E5228',
          600: '#543D1D',
          700: '#3E2D16',
          800: '#2C1E0F',
          900: '#1D1409',
        },
        tan: {
          DEFAULT: '#C1A77D',
          light: '#D8C7A8',
          dark: '#A98D5E',
        },
        cream: {
          DEFAULT: '#F5EEE3',
          dark: '#EDE3D2',
        },
      },
      minHeight: {
        tap: '56px',
      },
      minWidth: {
        tap: '56px',
      },
    },
  },
  plugins: [],
}
