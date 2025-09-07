// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Playwright configuration
 * - Uses PREVIEW_URL as base URL (required)
 * - Tests are written in JS to avoid TypeScript typecheck coupling
 */
module.exports = defineConfig({
  timeout: 60 * 1000,
  retries: 0,
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  reporter: [['list']],
  webServer: undefined, // Provide PREVIEW_URL instead of starting a server
});
