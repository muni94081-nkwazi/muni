const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/** Legal documents shared with the website — see extraNodeModules below. */
const LEGAL_CONTENT_DIR = path.resolve(__dirname, '..', 'frontend', 'shared', 'legal');

// ── SVG support ───────────────────────────────────────────────────────────────
const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  // Path alias @/ → src/
  // Path aliases. '@legal' points outside the mobile project root at the legal
  // documents shared with the website, so both platforms render one source.
  // Safe to bundle from outside the root because that module imports nothing at
  // all — no React, no React Native — so there is no second copy of a runtime
  // library for Metro's haste map to collide with. Keep it dependency-free.
  extraNodeModules: {
    '@': path.resolve(__dirname, 'src'),
    '@legal': LEGAL_CONTENT_DIR,
  },
};

// Metro only watches the project root by default, so the shared legal content
// has to be listed explicitly or edits to it would not trigger a rebuild.
config.watchFolders = [LEGAL_CONTENT_DIR];

module.exports = config;
