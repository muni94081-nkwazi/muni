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
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    // Raw <img> skips intrinsic width/height (so it reflows the page as it
    // loads — the largest single source of CLS here), skips srcset/sizes, and
    // skips the WebP/AVIF + connection-aware URL rewrite. Every one of those
    // is opt-out-by-accident, which is why this is an error rather than a
    // convention. Enforced via the built-in no-restricted-syntax instead of
    // react/forbid-elements so it needs no extra plugin dependency.
    'no-restricted-syntax': [
      'error',
      {
        selector: 'JSXOpeningElement[name.name="img"]',
        message:
          'Use <OptimizedImage> instead of a raw <img> — it supplies width/height (CLS), srcSet/sizes, and format negotiation.',
      },
      {
        // Seller-supplied copy renders as text today and there is no
        // dangerouslySetInnerHTML anywhere in this app — that is the reason it
        // has no XSS sink. If rich seller descriptions ever ship, sanitize
        // server-side on write rather than reintroducing an HTML sink here.
        selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
        message:
          'No HTML sinks in this app. Seller-supplied content must be sanitized server-side on write, not rendered raw here.',
      },
    ],
  },
  overrides: [
    {
      // The one place a raw <img> is correct — it IS the wrapper.
      files: ['src/components/common/OptimizedImage/OptimizedImage.tsx'],
      rules: { 'no-restricted-syntax': 'off' },
    },
  ],
};
