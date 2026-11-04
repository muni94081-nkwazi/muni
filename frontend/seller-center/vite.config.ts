import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Mount path under the single-domain nginx (see nginx/nginx.conf).
//
// Applied to production builds only: vite bakes `base` into every emitted asset
// URL, so without it the built index.html requests /assets/*.js at the domain
// root, which nginx routes to customer-web instead. `npm run dev` keeps serving
// at / so the local workflow is unchanged.
//
// It cannot come from .env.production — vite loads those into import.meta.env,
// not process.env, so a value read here would always be undefined.
const PROD_BASE = '/seller/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PROD_BASE : '/',
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  server: { port: 5175, proxy: { '/api': 'http://localhost:8080' } },
  // Strip console/debugger statements from production output only.
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
}));
