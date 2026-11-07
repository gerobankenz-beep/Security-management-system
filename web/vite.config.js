import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    env: { VITE_USE_MOCKS: process.env.VITE_USE_MOCKS ?? 'true', VITE_MOCK_LATENCY: '0' },
  },
});
