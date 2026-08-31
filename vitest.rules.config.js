import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/firebase.rules.test.js'],
    setupFiles: [],
  },
});
