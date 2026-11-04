// ESM + ts-jest, matching the service suites.
//
// This config is separate from every service's own so `turbo run test` never
// picks it up: the e2e suite needs a running stack and would fail the unit
// job. It runs only via `npm run test:e2e`.
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/**/*.test.ts'],
  moduleNameMapper: { '^(\.{1,2}/.*)\.js$': '$1' },
  transform: { '^.+\.tsx?$': ['ts-jest', { useESM: true }] },
  // One worker: the suite mutates shared database state, so parallel files
  // would truncate each other's orders mid-run.
  maxWorkers: 1,
  testTimeout: 180_000,
};
