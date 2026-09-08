import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so a production build also works when opened from a plain
  // folder or dropped on any static host.
  base: './',
  build: {
    outDir: 'dist',
    // One JS file and one CSS file keeps the build easy to inline or deploy.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
