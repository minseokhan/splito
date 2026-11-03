import { GO_FRAMES, INTRO, LOOP_DELAY, LOOP_MS, MINI_FRAMES, TWINKLE_FRAMES } from './AnimatedMark';

// @types/node가 없으므로 import 대신 require로 읽는다. jest의 cwd는 프로젝트 루트다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('node:fs') as { readFileSync: (p: string, enc: string) => string };

// 핸드오프 SVG(1차 소스)의 @keyframes·animation 선언을 그대로 옮겼는지 대조한다.
const svg = readFileSync('assets/logo/svg/splito-landing-icon.svg', 'utf8');

const sec = (ms: number) => String(ms / 1000).replace(/^0\./, '.');

test('등장 애니메이션의 지속·지연·easing이 핸드오프 SVG와 같다', () => {
  expect(svg).toContain(`animation:sp-pop ${sec(INTRO.tile.duration)}s cubic-bezier(.34,1.56,.64,1) both`);
  expect(svg).toContain(`animation:sp-s-in ${sec(INTRO.s.duration)}s cubic-bezier(.22,1,.36,1) ${sec(INTRO.s.delay)}s both`);
  expect(svg).toContain(`sp-go-in ${sec(INTRO.tri.duration)}s cubic-bezier(.22,1,.36,1) ${sec(INTRO.tri.delay)}s both`);
  expect(svg).toContain(`sp-star-in ${sec(INTRO.star.duration)}s cubic-bezier(.34,1.56,.64,1) ${sec(INTRO.star.delay)}s both`);
  expect(INTRO.tile.easing).toEqual([0.34, 1.56, 0.64, 1]);
  expect(INTRO.s.easing).toEqual([0.22, 1, 0.36, 1]);
});

test('반복 주기와 시작 지연이 핸드오프 SVG와 같다', () => {
  expect(svg).toContain(`sp-go ${LOOP_MS / 1000}s ease-in-out ${LOOP_DELAY.tri / 1000}s infinite`);
  expect(svg).toContain(`sp-twinkle ${LOOP_MS / 1000}s ease-in-out ${LOOP_DELAY.star / 1000}s infinite`);
  expect(svg).toContain(`animation:sp-mini ${LOOP_MS / 1000}s ease-in-out ${LOOP_DELAY.miniA / 1000}s infinite`);
  expect(svg).toContain(`.sp-mini.b{animation-delay:${LOOP_DELAY.miniB / 1000}s}`);
});

// @keyframes 본문에서 "NN%{...}" 블록을 뽑아 (비율, 선언) 쌍으로 돌려준다.
function keyframes(name: string) {
  const body = svg.match(new RegExp(`@keyframes ${name}\\{(.*?)\\}\\n`, 's'))?.[1] ?? '';
  return [...body.matchAll(/([\d%,\s]+)\{([^}]*)\}/g)].flatMap(([, ats, decl]) =>
    ats
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => ({ at: Number(a.replace('%', '')) / 100, decl })),
  ).sort((a, b) => a.at - b.at);
}

test('GO_FRAMES가 @keyframes sp-go와 같다', () => {
  const frames = keyframes('sp-go').map(({ at, decl }) => ({
    at,
    x: Number(decl.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? 0),
  }));
  expect(frames).toEqual(GO_FRAMES.map(({ at, x }) => ({ at, x })));
});

test('TWINKLE_FRAMES가 @keyframes sp-twinkle과 같다', () => {
  const frames = keyframes('sp-twinkle').map(({ at, decl }) => ({
    at,
    s: Number(decl.match(/scale\(([\d.]+)\)/)?.[1] ?? 1),
    r: Number(decl.match(/rotate\((-?[\d.]+)(?:deg)?\)/)?.[1] ?? 0),
  }));
  expect(frames).toEqual(TWINKLE_FRAMES.map(({ at, s, r }) => ({ at, s, r })));
});

test('MINI_FRAMES가 @keyframes sp-mini와 같다', () => {
  const frames = keyframes('sp-mini').map(({ at, decl }) => ({
    at,
    o: Number(decl.match(/opacity:([\d.]+)/)?.[1] ?? 0),
    s: Number(decl.match(/scale\(([\d.]+)\)/)?.[1] ?? 0),
  }));
  expect(frames).toEqual(MINI_FRAMES.map(({ at, o, s }) => ({ at, o, s })));
});
