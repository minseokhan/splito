const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // .js 테스트는 타입 정보가 없어 no-undef가 jest 전역을 모른다.
    files: ['**/__tests__/**/*.js'],
    languageOptions: { globals: { describe: 'readonly', it: 'readonly', expect: 'readonly' } },
  },
  {
    ignores: ['.claude/**', 'supabase/functions/**', 'web/**', 'scripts/**', 'ios/**', 'android/**', 'dist/**', '.expo/**', 'docs/design/**'],
  },
]);
