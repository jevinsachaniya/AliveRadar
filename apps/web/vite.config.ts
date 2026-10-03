import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  root: 'apps/web',
  plugins: [react(), tailwind()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
      '/health': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
      '/robots.txt': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
      '/sitemap.xml': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'] }, onlyExplicitManualChunks: true },
    },
  },
});
