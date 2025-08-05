/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./entrypoints/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: '#6B818E', // 藍鼠色
        'accent-light': '#8DA5B3',
        'accent-dark': '#4A5B66',
      },
    },
  },
  plugins: [],
}
