import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/espace/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/espace/api': 'http://localhost:8788',
      '/espace/auth': 'http://localhost:8788',
      '/espace/media': 'http://localhost:8788',
    },
  },
});
