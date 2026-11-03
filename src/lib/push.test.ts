import { notificationPath } from './push';

const ROOM = '10000000-0000-0000-0000-000000000001';
const EXPENSE = '30000000-0000-0000-0000-000000000002';

describe('notificationPath', () => {
  it('지출 상세 경로를 받는다', () => {
    expect(notificationPath({ path: `/rooms/${ROOM}/expenses/${EXPENSE}` })).toBe(`/rooms/${ROOM}/expenses/${EXPENSE}`);
  });

  it('정산 경로를 받는다', () => {
    expect(notificationPath({ path: `/rooms/${ROOM}/settle` })).toBe(`/rooms/${ROOM}/settle`);
  });

  it('아는 모양이 아니면 버린다', () => {
    expect(notificationPath({ path: '/settings' })).toBeNull();
    expect(notificationPath({ path: `/rooms/${ROOM}/expenses/${EXPENSE}/../../edit` })).toBeNull();
    expect(notificationPath({ path: `/rooms/not-a-uuid/settle` })).toBeNull();
    expect(notificationPath({ path: `https://evil.example/rooms/${ROOM}/settle` })).toBeNull();
  });

  it('path가 없거나 문자열이 아니면 버린다', () => {
    expect(notificationPath(null)).toBeNull();
    expect(notificationPath(undefined)).toBeNull();
    expect(notificationPath({})).toBeNull();
    expect(notificationPath({ path: 1 })).toBeNull();
  });
});
