import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enable Node.js API
    environment: 'node',
    
    // Setup files to run before each test file
    setupFiles: ['src/tests/setup.ts'],
    
    // Global test timeout
    testTimeout: 10000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        'test/**',
        'vitest.config.ts'
      ]
    }
  }
}); 