import { uuidV4 } from './uuid';

describe('uuidV4', () => {
  it('RFC 4122 v4 형식이고 Storage 경로 정규식([0-9a-f-]{36})을 만족한다', () => {
    const id = uuidV4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('호출마다 다르다', () => {
    expect(new Set(Array.from({ length: 100 }, uuidV4)).size).toBe(100);
  });
});
