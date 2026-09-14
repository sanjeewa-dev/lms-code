/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Primary teal accent (navy + teal mockups)
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // Secondary blue accent (mockup secondary icons/CTAs)
        accent: {
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        // Dark navy surfaces (sidebar ~#0B213F)
        ink: {
          700: '#334155',
          800: '#1e293b',
          850: '#12253f',
          900: '#0b213f',
          950: '#08182e',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)',
        'hero-gradient': 'linear-gradient(135deg, #0b213f 0%, #12253f 55%, #1e293b 100%)',
      },
    },
  },
  plugins: [],
};
