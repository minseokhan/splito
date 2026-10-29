import { colors } from './tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwind = require('../../tailwind.config.js');

test('tokens.ts 색상이 tailwind.config.js와 같다', () => {
  expect(tailwind.theme.extend.colors).toEqual(colors);
});
