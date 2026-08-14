/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 회사 e카탈로그와 같은 서체 (DESIGN.md). public/fonts/에 직접 담아 쓴다.
        sans: ['NanumSquareNeo', '"Segoe UI"', '"Malgun Gothic"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        // 표의 숫자는 고정폭을 유지한다 — 자릿수가 어긋나면 금액을 눈으로 못 맞춘다.
        data: ['Consolas', '"Cascadia Mono"', '"D2Coding"', 'monospace'],
        brand: ['Montserrat', 'NanumSquareNeo', 'sans-serif'],
      },
      colors: {
        // 데스크톱 업무화면 토큰. index.css의 CSS 변수와 값이 일치해야 한다.
        // oem-* 이름은 기존 컴포넌트가 쓰고 있어 유지하고, 값만 맞춘다.
        // 색은 회사 e카탈로그 기준 (DESIGN.md) — 초록 #007538.
        oem: {
          bg: {
            app: '#eceef1',
            panel: '#ffffff',
            header: '#e4e7eb',
          },
          border: '#b9bec7',
          text: {
            primary: '#16191d',
            secondary: '#5b626c',
            link: '#007538',      // IND 초록
          },
          red: '#c0392b',
          'red-dark': '#8f2a1e',
          // oem-blue는 17개 파일에서 123번 쓰이는데 설정에 없어 그동안 전부 무효였다.
          // 이름은 legacy지만 값은 강조색에 맞춘다.
          blue: '#007538',
          'blue-dark': '#005c2b',
          grey: {
            light: '#f7f8fa',
            medium: '#d6dae0',
          }
        },
        brand: {
          DEFAULT: '#007538',
          dark: '#005c2b',
          // 밝은 배경 위 글씨로 쓰이므로 '더 밝은 초록'을 둘 수 없다 (4.5:1 미달).
          light: '#007538',
          subtle: '#e6f2ea',
        },
        primary: {
          50: '#e6f2ea',
          500: '#007538',
          600: '#005c2b',
        }
      },
      borderRadius: {
        'oem': '2px', // 데스크톱 프로그램 느낌
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
