import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 설정 파일
 * 로컬 서버를 자동으로 실행하고 테스트를 수행합니다.
 */
export default defineConfig({
  testDir: './tests',
  /* 테스트 타임아웃 설정 */
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  /* 테스트 병렬 실행 설정 */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  /* 리포터 설정 */
  reporter: 'html',
  /* 공유 설정 */
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* 프로젝트별 브라우저 설정 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* 웹 서버 설정 - 테스트 전에 자동으로 서버 실행 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

