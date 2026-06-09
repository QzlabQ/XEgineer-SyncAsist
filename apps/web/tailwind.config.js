/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#0d9488', hover: '#0f766e', active: '#115e59', soft: '#f0fdf9' },
        app: { bg: '#fafbfc', surface: '#ffffff', subtle: '#f8f9fa', hover: '#f1f3f5' },
        border: { DEFAULT: '#e2e5e9', subtle: '#eef0f2', hover: '#ced4da' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px', md: '8px', lg: '12px', xl: '16px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(0,0,0,0.03)',
        'card-hover': '0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.03)',
        overlay: '0 20px 25px -5px rgba(0,0,0,0.06), 0 8px 10px -6px rgba(0,0,0,0.04)',
      },
      transitionDuration: { fast: '120ms', normal: '160ms', slow: '220ms' },
      transitionTimingFunction: { 'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)', spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    },
  },
  plugins: [],
}
