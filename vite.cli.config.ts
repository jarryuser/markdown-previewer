import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: './src/cli.ts',
      formats: ['es'],
      fileName: () => 'cli.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    target: 'node18',
    rollupOptions: {
      external: [/^node:/, 'blessed', 'puppeteer-core'],
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
  },
});
