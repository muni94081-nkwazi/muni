// Mirrors frontend/customer-web/.eslintrc.cjs and frontend/seller-center's.
// admin-panel shipped a `lint` script but no config, so `npm run lint` failed
// with "ESLint couldn't find a configuration file" — it had never run.
//
// Same two deviations from customer-web as seller-center:
//
//   • No `no-restricted-syntax` rule against raw <img>. That rule forces use of
//     customer-web's <OptimizedImage>; this app has no such component, so the
//     rule would flag six call sites with nothing to migrate them to. The CLS
//     argument is also weakest here — an internal admin tool behind a login is
//     not competing for Core Web Vitals.
//   • The dangerouslySetInnerHTML ban IS kept. Zero occurrences today, and this
//     app renders seller- and buyer-supplied content (review moderation, support
//     tickets, dispute descriptions) where an HTML sink would be worst.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'dev-dist', '.eslintrc.cjs', 'vite.config.ts', 'scripts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // `_`-prefixed args are the established convention across this repo for
    // parameters kept for signature compatibility (see users.api.ts's `_role`).
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    'no-restricted-syntax': [
      'error',
      {
        selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
        message:
          'No HTML sinks in this app. User-supplied content (reviews, tickets, disputes) must be sanitized server-side on write, not rendered raw here.',
      },
    ],
  },
};
