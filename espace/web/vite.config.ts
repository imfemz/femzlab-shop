import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Proxy /api et /auth (magic links, dev-login) vers le backend Express (server/, port 4600).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4600',
      '/auth': 'http://localhost:4600',
    },
  },
});
