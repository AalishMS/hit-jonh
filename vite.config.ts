/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative base so the static build works from any host sub-path.
  base: './',
  resolve: {
    alias: {
      '@matter-js': fileURLToPath(new URL('./node_modules/phaser/src/physics/matter-js/CustomMain.js', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Phaser is large; keep it in its own chunk and silence the expected size warning.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
