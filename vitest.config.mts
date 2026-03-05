import path from 'node:path';

import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      '.claude/**',
      '**/.claude/**',
    ],
  },
});
