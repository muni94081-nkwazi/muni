/**
 * ESLint 8 flat-file-free config. `npm run lint` previously failed outright —
 * the script existed but no config file did, so eslint exited with
 * "No ESLint configuration found".
 *
 * Only plugins already declared in package.json are used, so this needs no
 * further installs.
 */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  settings: {
    react: { version: 'detect' },
  },
  globals: {
    __DEV__: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    fetch: 'readonly',
  },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // Unused args prefixed with _ are intentional (thunk signatures, catch args).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: [
    'node_modules/',
    '.expo/',
    'dist/',
    'web-build/',
    'expo-env.d.ts',
    'babel.config.js',
    'metro.config.js',
    '.eslintrc.js',
  ],
};
