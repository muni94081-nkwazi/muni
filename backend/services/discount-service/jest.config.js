// ESM + ts-jest. Mirrors the config the other services carry inline in
// package.json; kept as a file here so the note below has somewhere to live.
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },

  // src/__tests__/coupon.service.test.ts is orphaned and cannot compile: it
  // imports `../coupon.service.js` and mocks `../prisma.js`, and neither
  // exists — discount-service has no Prisma layer and no CouponService. It
  // never ran before (this service had no jest config at all), so adding one
  // surfaced it rather than broke it.
  //
  // Excluded rather than deleted because the working tree is not under version
  // control here, so a delete would be unrecoverable. It is dead weight and
  // should be removed once someone confirms nothing is waiting on it.
  testPathIgnorePatterns: ['/node_modules/', 'coupon\\.service\\.test\\.ts$'],
};
