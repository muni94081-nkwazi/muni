/** ts-jest + native ESM. Mirrors the api-gateway / checkout-service setup. */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Strip the .js specifier ESM requires so ts-jest can resolve the .ts source.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        tsconfig: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
        },
      },
    ],
  },
};
