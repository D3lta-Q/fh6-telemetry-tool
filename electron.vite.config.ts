import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * electron-vite normally auto-detects entry points at:
 *   - src/main/{index|main}.{js,ts,mjs,cjs}
 *   - src/preload/{index|preload}.{js,ts,mjs,cjs}
 *   - src/renderer/index.html
 *
 * In some 2.x installs the auto-detection silently fails when you also
 * provide top-level resolve.alias config (which we need for "@shared" and
 * "@renderer"), so we set the entries explicitly. This is the fix the
 * electron-vite docs themselves recommend for this error.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve('src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
});
