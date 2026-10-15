/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        latin: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f9fa',
          100: '#d9f0f3',
          200: '#b5e2e8',
          300: '#83ccd7',
          400: '#4aacbe',
          500: '#2f8ea4',
          600: '#29728b',
          700: '#275d72',
          800: '#274e5f',
          900: '#244251',
          950: '#132c38',
        },
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        ink: {
          DEFAULT: '#0f172a',
          soft: '#475569',
          mute: '#94a3b8',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px -12px rgba(15, 23, 42, 0.18)',
        pop: '0 12px 40px -12px rgba(15, 23, 42, 0.3)',
      },
      borderRadius: {
        xl2: '1.125rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.18s ease-out',
        'slide-in': 'slide-in 0.22s ease-out',
      },
    },
  },
  plugins: [],
};
