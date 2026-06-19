/** @type {import('tailwindcss').Config} */
const withOpacity = (v) => ({ opacityValue }) =>
  opacityValue === undefined ? `rgb(${v})` : `rgb(${v} / ${opacityValue})`

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        canvas: withOpacity('var(--color-canvas)'),
        surface: withOpacity('var(--color-surface)'),
        brand: {
          50: withOpacity('var(--color-brand-50)'),
          100: withOpacity('var(--color-brand-100)'),
          500: withOpacity('var(--color-brand-500)'),
          600: withOpacity('var(--color-brand-600)'),
          700: withOpacity('var(--color-brand-700)'),
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
}
