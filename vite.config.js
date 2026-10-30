import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The multi-threaded engine needs these; production sets the same in vercel.json.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  // Relative base so a production build also works when opened from a plain
  // folder or dropped on any static host.
  base: './',
  build: {
    outDir: 'dist',
    // Pages other than the Club page are split into their own files and load
    // when opened (src/lazyPage.js). `base: './'` keeps those paths relative.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    headers: crossOriginIsolation,
  },
  preview: {
    headers: crossOriginIsolation,
  },
});
