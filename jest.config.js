module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/supabase/', '/web/', '/node_modules/', '<rootDir>/.claude/'],
  // lucide-react-native의 react-native 진입점은 ESM(.mjs)이라 jest가 못 읽는다. CJS 빌드를 쓴다.
  moduleNameMapper: { '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js' },
};
