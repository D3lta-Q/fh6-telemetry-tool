/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: {
          DEFAULT: '#0a0a0b',
          surface: '#15161a',
          elevated: '#1c1d22',
          input: '#0f1014',
        },
        border: {
          DEFAULT: '#26272d',
          muted: '#1d1e23',
          accent: '#3a3b42',
        },
        text: {
          DEFAULT: '#e8e8eb',
          muted: '#8b8c93',
          dim: '#5a5b62',
        },
        accent: {
          red: '#ff3c1c',
          yellow: '#ffd60a',
          cyan: '#00d4ff',
          lime: '#a3ff12',
          magenta: '#ff2d92',
        },
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
