import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    // The memory MongoDB binary can need a first-download window on a new
    // developer/CI machine; individual tests remain ordinary short requests.
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    fileParallelism: false,
    env: {
      PORT: '4999',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/claim-ledger-test',
      FRONTEND_URL: 'http://localhost:5173',
      DEMO_MODE: 'true',
      SEED_ON_START: 'false',
      // Deliberately absent/blank: tests mock llmClient and never call a
      // provider or require an API key.
      LLM_API_KEY: '',
      LLM_BASE_URL: '',
      LLM_MODEL: '',
    },
  },
})
