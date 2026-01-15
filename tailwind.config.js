/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Linear-inspired neutral palette
        background: {
          page: '#F7F7F8',      // 전체 페이지 배경
          content: '#FFFFFF',    // 콘텐츠 영역 배경
        },
        text: {
          primary: '#111827',   // 제목
          body: '#374151',      // 본문
          secondary: '#6B7280', // 보조 텍스트
        },
        brand: {
          green: '#16A34A',      // 성공/저장 버튼용 녹색
          blue: '#6366F1',       // 기본 브랜드 인디고
          'green-hover': '#15803D',
          'blue-hover': '#4F46E5',
        },
        border: {
          light: '#E5E7EB',      // 기본 테두리
          input: '#D1D5DB',     // 입력창 테두리
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
        'button': '8px',
        'card': '10px',
      },
      boxShadow: {
        'subtle': '0 1px 2px rgba(17,24,39,0.06)',
        'soft': '0 8px 24px rgba(17,24,39,0.08)',
        'modal': '0 16px 40px rgba(17,24,39,0.12)',
      },
    },
  },
  plugins: [],
}
