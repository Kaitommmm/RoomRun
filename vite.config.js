import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // `npm run phone` runs the relay on :8787; dev mode talks to it through here
    proxy: {
      '/ws': { target: 'http://localhost:8787', ws: true },
      '/tunnel-url': 'http://localhost:8787',
    },
  },
  build: {
    rollupOptions: { input: { main: 'index.html', phone: 'phone.html' } },
  },
});
