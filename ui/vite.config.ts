import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production bundle is loaded by pywebview from a local file, so all
// asset URLs must be relative to the page (base: './'), never absolute.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
});
