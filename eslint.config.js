const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // .js 테스트는 타입 정보가 없어 no-undef가 jest 전역을 모른다.
    files: ['**/__tests__/**/*.js', 'jest.setup.js'],
    languageOptions: { globals: { describe: 'readonly', it: 'readonly', expect: 'readonly', jest: 'readonly' } },
  },
  {
    // 공개 웹(web/)은 번들러도 타입 검사도 테스트도 닿지 않는 브라우저 전역 스크립트다.
    // 전부 제외하면 선언 순서 같은 기초 실수가 배포까지 살아남는다(실제로 그랬다) —
    // 타입에 기대지 않는 규칙만 골라 돌린다.
    files: ['web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2019,
      sourceType: 'script',
      globals: { window: 'readonly', document: 'readonly', location: 'readonly', fetch: 'readonly', localStorage: 'readonly', navigator: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' },
    },
    rules: {
      // 이 디렉터리는 빌드를 거치지 않고 그대로 배포된다 — var·ES5 문법은 의도다.
      'no-var': 'off',
      'prefer-const': 'off',
      // 잡고 싶은 것은 이것 하나다: 선언보다 먼저 쓴 변수(호이스팅으로 undefined가 된다).
      'no-use-before-define': ['error', { variables: true, functions: false }],
      'no-undef': 'error',
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    ignores: ['.claude/**', 'supabase/functions/**', 'scripts/**', 'ios/**', 'android/**', 'dist/**', '.expo/**', 'docs/design/**'],
  },
]);
