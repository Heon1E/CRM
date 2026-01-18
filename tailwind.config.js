/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Linear-inspired dark palette (tuned to linear.app)
        background: {
          page: '#080808',      // 전체 페이지 배경
          content: '#0D0F12',   // 콘텐츠 영역 배경
        },
        text: {
          primary: '#FAFAFA',   // 제목
          body: '#A1A1AA',      // 본문
          secondary: '#71717A', // 보조 텍스트
        },
        brand: {
          green: '#3CCF91',      // Linear-like green
          blue: '#5E6AD2',       // Linear-like indigo
          'green-hover': '#2FBB7D',
          'blue-hover': '#4E58C2',
        },
        border: {
          light: '#27272A',      // 기본 테두리
          input: '#27272A',      // 입력창 테두리
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
        'primary-teal': '#6CB8B0',
        'accent-peach': '#F1B59D',
        'accent-green': '#8CC7A6',
        'accent-purple': '#B4A1DE',
        'pastel-teal': '#D9F2EF',
        'pastel-peach': '#F9E3D7',
        'pastel-green': '#DDEFE5',
        'pastel-purple': '#E7E0F4',
        'pastel-neutral': '#E7EDF3',
        'ink-teal': '#2F6F6A',
        'ink-peach': '#A8644D',
        'ink-green': '#2E6F5A',
        'ink-purple': '#5C4A8C',
      },
      borderRadius: {
        'button': '10px',
        'card': '12px',
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
