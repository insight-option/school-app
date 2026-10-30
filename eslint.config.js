// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.amplify/*', 'node_modules/*', 'coverage/*', 'plugins/*'],
  },
  {
    rules: {
      'import/no-unresolved': 'off',
      // TypeScript already verifies namespace members; the import plugin cannot follow Expo 58's
      // `export *` chains (e.g. Notifications.AndroidImportance) and reports false positives.
      'import/namespace': 'off',
    },
  },
  {
    files: ['jest.setup.js', '__tests__/**/*.ts'],
    languageOptions: { globals: { jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly' } },
  },
]);
