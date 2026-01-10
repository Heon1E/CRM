/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Pipedrive 스타일 컬러 팔레트
        background: {
          page: '#F4F5F7',      // 전체 페이지 배경
          content: '#FFFFFF',    // 콘텐츠 영역 배경
        },
        text: {
          primary: '#26292C',   // 제목
          body: '#474747',      // 본문
          secondary: '#747678', // 보조 텍스트
        },
        brand: {
          green: '#00890E',      // 성공/저장 버튼용 녹색
          blue: '#317AE2',       // 기본 브랜드 블루
          'green-hover': '#00700B',
          'blue-hover': '#2563D1',
        },
        border: {
          light: '#E0E0E0',      // 기본 테두리
          input: '#D8D8D8',     // 입력창 테두리
        },
        // 기존 primary는 호환성을 위해 유지하되 brand로 매핑
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#317AE2',
          600: '#2563D1',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      borderRadius: {
        'button': '4px',
        'card': '8px',
      },
      boxShadow: {
        'subtle': '0 1px 2px rgba(0,0,0,0.1)',
        'soft': '0 2px 8px rgba(0,0,0,0.08)',
        'modal': '0 4px 16px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
