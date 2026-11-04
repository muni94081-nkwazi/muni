// ESM + ts-jest. Mirrors the config the other services carry inline in
// package.json; kept as a file here so the `moduleNameMapper` rewrite that
// strips the `.js` suffix from relative TS imports is readable.
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1',
  },
  transform: {
    '^.+\.tsx?$': ['ts-jest', { useESM: true }],
  },
};
