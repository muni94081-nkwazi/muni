module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
        },
      ],
    ],
    env: {
      production: {
        // Strips console.* calls from production JS bundles (release builds).
        // console.error/warn are kept so real crash/error signals still reach
        // device logs and crash reporting.
        plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
      },
    },
  };
};
