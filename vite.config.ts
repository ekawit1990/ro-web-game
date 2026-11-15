import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // the game, and the admin panel at /admin.html (src/admin/admin.ts)
      input: { main: 'index.html', admin: 'admin.html' },
    },
  },
});
