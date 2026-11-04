export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  // Default testMatch treats every file under __tests__ as a suite, so
  // __tests__/helpers/* was reported as a suite with no tests in it.
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
