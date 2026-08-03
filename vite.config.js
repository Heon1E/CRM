import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// ✅ 1. 방금 설치한 전문 플러그인을 불러옵니다.
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // ✅ 2. 플러그인을 실행합니다.
    // 이 플러그인이 global, Buffer, process 등 브라우저에 없는 모든 Node.js 변수를
    // 자동으로 알아서 처리해줍니다. 복잡한 수동 설정이 필요 없습니다.
    nodePolyfills({
      protocolImports: true, // 'stream', 'util' 같은 Node.js 내장 모듈 임포트도 지원
    }),
  ],
  resolve: {
    alias: {
      // 혹시 모를 충돌 방지를 위한 안전장치
      process: "process/browser",
    }
  },
  server: {
    port: 5173,
    strictPort: true, // 5173 사용 중이면 강제 실패 (포트 혼재 방지)
    host: true, // LAN 접근 허용
    hmr: {
      host: 'localhost',
      clientPort: 5173, // 브라우저 WS 연결 포트 명시
      overlay: true,
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  }
})