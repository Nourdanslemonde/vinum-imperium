// Playwright 설정 — 단일 HTML 게임을 file:// 로 직접 로드해 검증 (별도 서버 불필요)
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    headless: true,
    // 오디오 자동재생 정책이 클릭 없이도 통과하도록 (테스트 안정화)
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
});
