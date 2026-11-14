import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so a production build also works when opened from a plain
  // folder or dropped on any static host. Pages other than the Club page are
  // split into their own files and load when opened (src/app/lazyPage.js).
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Libraries change far less often than the app. In their own files
        // they stay cached across deploys, so an update downloads only the
        // app's code, not Supabase and React again.
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
