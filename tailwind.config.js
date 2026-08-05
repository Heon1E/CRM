/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 웹폰트를 쓰지 않는다. 설치된 PC 프로그램처럼 보이게 하는 핵심 요소.
        sans: ['"Segoe UI"', '"Malgun Gothic"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        data: ['Consolas', '"Cascadia Mono"', '"D2Coding"', 'monospace'],
      },
      colors: {
        // 데스크톱 업무화면 토큰. index.css의 CSS 변수와 값이 일치해야 한다.
        // oem-* 이름은 기존 컴포넌트가 쓰고 있어 유지하고, 값만 맞춘다.
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
            link: '#c74634',      // Oracle 계열 붉은색
          },
          red: '#c0392b',
          'red-dark': '#8f2a1e',
          // oem-blue는 17개 파일에서 123번 쓰이는데 설정에 없어 그동안 전부 무효였다.
          // 이름은 legacy지만 값은 강조색에 맞춘다.
          blue: '#c74634',
          'blue-dark': '#a3341f',
          grey: {
            light: '#f7f8fa',
            medium: '#d6dae0',
          }
        },
        brand: {
          DEFAULT: '#c74634',
          dark: '#a3341f',
          light: '#d8695a',
          subtle: '#fbeeeb',
        },
        primary: {
          50: '#fbeeeb',
          500: '#c74634',
          600: '#a3341f',
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
