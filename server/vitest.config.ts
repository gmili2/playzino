import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/test/setupEnv.ts'],
    globalSetup: ['src/test/globalSetup.ts'],
    // Integration suites share one MariaDB test database.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000
  }
});
