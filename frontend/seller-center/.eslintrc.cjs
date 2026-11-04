// Mirrors frontend/customer-web/.eslintrc.cjs. Seller Center had no config at
// all, so `npm run lint` failed with "ESLint couldn't find a configuration
// file" — the script existed but had never run.
//
// Two deliberate differences from customer-web:
//
//   • No `no-restricted-syntax` rule against raw <img>. That rule exists there
//     to force use of its <OptimizedImage> wrapper; this app has no such
//     component, so the rule would flag three call sites with nothing to
//     migrate them to.
//   • The dangerouslySetInnerHTML ban IS kept. There are zero occurrences
//     today, so it costs nothing and stops an HTML sink appearing later in an
//     app that renders seller- and buyer-supplied text.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'dev-dist', '.eslintrc.cjs', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // `_`-prefixed args are the established convention for deliberately unused
    // parameters across this repo (see the API modules' `_role`, `_search`).
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    'no-restricted-syntax': [
      'error',
      {
        selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
        message:
          'No HTML sinks in this app. Seller- or buyer-supplied content must be sanitized server-side on write, not rendered raw here.',
      },
    ],
  },
};
