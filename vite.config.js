import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { proxy: { '/api/passes': 'http://127.0.0.1:8787' } },
});
