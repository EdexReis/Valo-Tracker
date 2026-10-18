/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        val: {
          bg: '#0f1923',
          panel: '#16222e',
          raised: '#1d2c3b',
          line: '#2a3b4d',
          red: '#ff4655',
          blue: '#4fc3c8',
          text: '#ece8e1',
          mute: '#8b98a5'
        }
      },
      fontFamily: { sans: ['Segoe UI', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
