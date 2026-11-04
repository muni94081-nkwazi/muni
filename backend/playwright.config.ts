import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
});
