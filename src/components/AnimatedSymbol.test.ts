import { POP_CYCLE_MS, POP_EASING, POP_KEYFRAMES, YELLOW_DELAY_MS } from './AnimatedSymbol';

// @types/node가 없으므로 import 대신 require로 읽는다. jest의 cwd는 프로젝트 루트다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('node:fs') as { readFileSync: (p: string, enc: string) => string };

// 핸드오프 SVG(1차 소스)의 @keyframes를 그대로 옮겼는지 대조한다. 시안이 바뀌면 여기서 깨진다.
const svg = readFileSync('assets/logo/svg/splito-symbol-animated.svg', 'utf8');

test('POP_KEYFRAMES가 핸드오프 SVG의 @keyframes sp-pop과 같다', () => {
  const frames = [...svg.matchAll(/(\d+)%(?:,\s*\d+%)?\{transform:translateY\((-?[\d.]+)(?:px)?\)\}/g)].map(
    ([, at, y]) => ({ at: Number(at) / 100, y: Number(y) }),
  );
  expect(frames.length).toBe(5);
  expect(frames).toEqual(POP_KEYFRAMES.map(({ at, y }) => ({ at, y })));
});

test('주기·딜레이·easing이 핸드오프 SVG와 같다', () => {
  expect(svg).toContain(`animation:sp-pop ${POP_CYCLE_MS / 1000}s cubic-bezier(.34,1.56,.64,1) infinite`);
  expect(POP_EASING).toEqual([0.34, 1.56, 0.64, 1]);
  expect(svg).toContain('animation-delay:.12s');
  expect(YELLOW_DELAY_MS).toBe(120);
});
