/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DESIGN.md 토큰. index.css의 CSS 변수와 값이 일치해야 한다.
        // oem-* 이름은 기존 컴포넌트가 쓰고 있어 유지하고, 값만 브랜드에 맞춘다.
        oem: {
          bg: {
            app: '#f7f8fa',
            panel: '#ffffff',
            header: '#ffffff',
          },
          border: '#e6e8ee',
          text: {
            primary: '#12141a',
            secondary: '#5a6072',
            link: '#833CF6',      // Primary Indigo Purple
          },
          red: '#dc2626',
          'red-dark': '#b91c1c',
          // oem-blue는 17개 파일에서 123번 쓰이는데 설정에 없어 그동안 전부 무효였다.
          // (bg-oem-blue가 투명해지면서 흰 글씨만 남아 안 보이는 곳이 있었다)
          // 이름은 legacy지만 값은 브랜드 색에 맞춘다.
          blue: '#833CF6',
          'blue-dark': '#6d28d9',
          grey: {
            light: '#f1f3f7',
            medium: '#e6e8ee',
          }
        },
        brand: {
          DEFAULT: '#833CF6',
          dark: '#6d28d9',
          light: '#9b62f8',
          subtle: '#f5f3ff',
        },
        primary: {
          50: '#f5f3ff',
          500: '#833CF6',
          600: '#6d28d9',
        }
      },
      borderRadius: {
        'oem': '8px', // DESIGN.md: ROUND_EIGHT
      },
      minHeight: {
        'tap': '44px', // 터치 최소 영역
      },
      boxShadow: {
        'subtle': '0 1px 2px rgba(18,20,26,0.05)',
        'soft': '0 8px 24px rgba(18,20,26,0.08)',
        'modal': '0 18px 40px rgba(18,20,26,0.12)',
      },
      backgroundImage: {
        'gradient-teal-soft': 'linear-gradient(135deg, #E6F6F3 0%, #FFFFFF 70%)',
        'gradient-peach-soft': 'linear-gradient(135deg, #FDE7D9 0%, #FFFFFF 70%)',
      },
    },
  },
  plugins: [],
}
