import {
  MARK_GOLD,
  MARK_MID,
  MARK_MINI_A,
  MARK_MINI_B,
  MARK_S,
  MARK_SHIFT_X,
  MARK_STAR,
  MARK_TILE_RADIUS_RATIO,
  MARK_TRIANGLE,
} from '../Logo';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('node:fs') as { readFileSync: (p: string, enc: string) => string };

const mark = readFileSync('assets/logo/svg/splito-mark.svg', 'utf8');
const tile = readFileSync('assets/logo/svg/splito-mark-tile.svg', 'utf8');

// 핸드오프 SVG(1차 소스)의 도형을 그대로 옮겼는지 대조한다. 로고가 바뀌면 여기서 깨진다.
test('마크 path가 splito-mark.svg와 같다', () => {
  for (const d of [MARK_S, MARK_TRIANGLE, MARK_STAR, MARK_MINI_A, MARK_MINI_B]) {
    expect(mark).toContain(`d="${d}"`);
  }
});

test('그라데이션 색과 좌표 이동이 핸드오프와 같다', () => {
  expect(mark).toContain(`stop-color="${MARK_MID[0]}"`);
  expect(mark).toContain(`stop-color="${MARK_MID[1]}"`);
  expect(mark).toContain(`stop-color="${MARK_GOLD[0]}"`);
  expect(mark).toContain(`stop-color="${MARK_GOLD[1]}"`);
  expect(mark).toContain(`translate(${MARK_SHIFT_X} 0)`);
});

test('타일 모서리 반경이 splito-mark-tile.svg와 같다', () => {
  expect(tile).toContain(`rx="${MARK_TILE_RADIUS_RATIO * 100}"`);
});
