/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        oem: {
          bg: {
            app: '#ffffff',
            panel: '#f8f9fa',
            header: '#eff2f5',
          },
          border: '#dce1e7',
          blue: '#0076ce',
          green: '#4caf50',
          red: '#f44336',
          text: {
            primary: '#333333',
            secondary: '#666666',
            link: '#0076ce',
          }
        },
        primary: {
          50: '#f0f9ff',
          // ... (keep existing primary for back-compat if needed, but we will mostly use oem)
          500: '#0076ce',
        }
      },
      borderRadius: {
        'oem': '2px', // Nearly square with slight curve
      },
      boxShadow: {
        'subtle': '0 1px 2px rgba(0,0,0,0.25)',
        'soft': '0 10px 30px rgba(0,0,0,0.35)',
        'modal': '0 18px 40px rgba(0,0,0,0.45)',
      },
      backgroundImage: {
        'gradient-teal-soft': 'linear-gradient(135deg, #E6F6F3 0%, #FFFFFF 70%)',
        'gradient-peach-soft': 'linear-gradient(135deg, #FDE7D9 0%, #FFFFFF 70%)',
      },
    },
  },
  plugins: [],
}
