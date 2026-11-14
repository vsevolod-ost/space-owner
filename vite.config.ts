import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths: the build also works when hosted from a subdirectory.
  base: './',
  resolve: {
    // `@/foo` resolves to `src/foo`; keep in sync with `paths` in tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Phaser alone weighs about 1.4 MB, so the size warning is useless here.
    chunkSizeWarningLimit: 1500,
  },
});
