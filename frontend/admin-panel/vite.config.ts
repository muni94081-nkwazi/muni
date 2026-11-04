import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const PROD_BASE = '/admin/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PROD_BASE : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5176,
    proxy: { '/api': 'http://localhost:8080' },
  },
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
}));
