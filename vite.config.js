import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths keep dist/ portable when hosted from any subdirectory.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    // Three.js makes the single game chunk larger than Vite's default warning;
    // gzip is about 166 kB, which is expected for a 3D game.
    chunkSizeWarningLimit: 900,
  },
});
