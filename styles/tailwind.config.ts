import type { Config } from 'tailwindcss';

export default {
  darkMode: 'media',
  content: [
    './entrypoints/**/*.{html,ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './public/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        accent: '#6B818E',
      },
      borderRadius: {
        'xl': '12px',
      },
    },
  },
  plugins: [],
} satisfies Config;
