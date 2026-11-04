/** ts-jest + native ESM. Mirrors the api-gateway / checkout-service setup. */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Generated Prisma client is large and not under test.
  testPathIgnorePatterns: ['/node_modules/', '/generated/'],
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
