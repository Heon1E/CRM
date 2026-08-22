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
          /*
           * 어두운 면(랜딩의 #0f172a·#1e293b) 위에 쓰는 밝은 초록.
           * 브랜드 초록 #007538은 진해서 어두운 배경에서 2.5:1까지 떨어진다
           * (실측: 랜딩에서 4곳 실패). 같은 계열로 밝기만 올렸다 —
           * #0f172a 위 6.95:1 / #1e293b 위 5.90:1.
           */
          'blue-light': '#45b97a',
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
      keyframes: {
        // Toast(`animate-slide-in`) 와 설정 탭(`animate-fade-in`)이 쓰는데
        // 정의가 없어 아무 일도 일어나지 않았다. 여기서 만든다.
        'slide-in': {
          '0%': { opacity: '0', transform: 'translate(-50%, calc(-50% + 8px))' },
          '100%': { opacity: '1', transform: 'translate(-50%, -50%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // RevenueForecastPanel 의 진행 막대 (animate-[loading_2s...])
        loading: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        // 모바일에서는 짧아야 빠릿하게 느껴진다. 200ms 안쪽으로 둔다.
        'slide-in': 'slide-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 160ms ease-out',
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
  plugins: [
    /*
     * **이 플러그인이 없으면 `animate-in`·`fade-in`·`slide-in-from-*`이
     * 전부 무효 클래스가 된다.** 코드 8곳 이상이 그 클래스를 쓰고 있었는데
     * 플러그인이 빠져 있어 모달이 툭 나타났다 툭 사라졌다.
     * `oem-blue`가 123번 쓰였는데 설정에 없어 투명했던 것과 같은 종류다.
     * 빌드타임에 CSS만 만들어 낸다 — 런타임 비용 0.
     */
    require('tailwindcss-animate'),
  ],
}
