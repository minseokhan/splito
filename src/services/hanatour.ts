// 하나투어 예약 조회 — 목업.
// 실제 API가 아직 없어서 고정 픽스처를 돌려준다. 교체할 때는 lookupBooking의 본문만 바꾸면 되고
// 호출부(화면·api.ts)는 그대로 둔다. 서버 응답이 최종 기준이라는 전제는 목업에서도 같다.
import { isValidBookingNo, maskHolder } from '@/lib/booking';

export type BookingSchedule = {
  day_index: number; // 0 = 여행 전
  start_time: string; // HH:MM
  title: string;
  includes?: string[];
  excludes?: string[];
  optional?: boolean;
  est_amount?: number;
};

export type BookingInfo = {
  provider: 'hanatour';
  booking_no: string;
  holder_masked: string;
  product_name: string;
  destination: string;
  start_date: string;
  end_date: string;
  pax: number;
  paid_amount: number;
  paid_at: string;
  schedule: BookingSchedule[];
};

// 방을 새로 만들 때 쓰는 기본값. 예약에서 뽑되 방 이름은 상품명보다 짧게 쓴다.
export type BookingRoomDefaults = { name: string; baseCurrency: string };

export type BookingLookup =
  | { kind: 'success'; booking: BookingInfo; room: BookingRoomDefaults }
  | { kind: 'notFound' }
  | { kind: 'canceled' }
  | { kind: 'fail' };

// ponytail: 목업 분기용 예약번호. 실제 API를 붙이면 통째로 지운다.
// HT0000-00000 예약 없음 / HT9999-99999 취소된 예약 / HT5555-55555 조회 실패.
// '이미 연결됨'은 서버 booking_owner가 판정하므로 매직 번호가 없다(같은 번호로 두 번 조회하면 재현된다).
const NOT_FOUND = 'HT0000-00000';
const CANCELED = 'HT9999-99999';
const FAIL = 'HT5555-55555';

const SCHEDULE: BookingSchedule[] = [
  { day_index: 1, start_time: '09:30', title: '인천 → 간사이 (KE723)', includes: ['항공 포함'] },
  { day_index: 1, start_time: '13:00', title: '오사카성 공원', includes: ['가이드', '입장료 포함'] },
  { day_index: 1, start_time: '18:30', title: '도톤보리 자유 석식', excludes: ['석식 불포함'] },
  { day_index: 2, start_time: '08:00', title: '호텔 조식', includes: ['조식 포함'] },
  { day_index: 2, start_time: '09:30', title: '유니버설 스튜디오 재팬', includes: ['입장료 포함'] },
  { day_index: 2, start_time: '11:00', title: '익스프레스 패스 4', optional: true, est_amount: 180_000 },
  { day_index: 2, start_time: '19:30', title: '호텔 석식 뷔페', includes: ['석식 포함'] },
  { day_index: 3, start_time: '09:00', title: '교토 이동 · 전용 버스', includes: ['교통 포함'] },
  { day_index: 3, start_time: '10:30', title: '기요미즈데라', includes: ['입장료 포함'] },
  { day_index: 3, start_time: '13:00', title: '기모노 체험', optional: true, est_amount: 45_000 },
  { day_index: 3, start_time: '17:00', title: '신사이바시 자유시간', excludes: ['불포함'] },
  { day_index: 4, start_time: '10:00', title: '린쿠 프리미엄 아울렛', excludes: ['자유 쇼핑'] },
  { day_index: 4, start_time: '15:40', title: '간사이 → 인천 (KE724)', includes: ['항공 포함'] },
];

const LOOKUP_MS = 700;

export async function lookupBooking(bookingNo: string, holder: string): Promise<BookingLookup> {
  await new Promise((r) => setTimeout(r, LOOKUP_MS));
  if (!isValidBookingNo(bookingNo) || !holder.trim()) return { kind: 'notFound' };
  if (bookingNo === NOT_FOUND) return { kind: 'notFound' };
  if (bookingNo === CANCELED) return { kind: 'canceled' };
  if (bookingNo === FAIL) return { kind: 'fail' };
  return {
    kind: 'success',
    room: { name: '오사카·교토 4일', baseCurrency: 'JPY' },
    booking: {
      provider: 'hanatour',
      booking_no: bookingNo,
      holder_masked: maskHolder(holder),
      product_name: '[하나투어] 오사카·교토 4일 · USJ 자유일정',
      destination: '일본 · 오사카, 교토',
      start_date: '2025-10-20',
      end_date: '2025-10-23',
      pax: 4,
      paid_amount: 2_980_000,
      paid_at: '2025-10-02',
      schedule: SCHEDULE,
    },
  };
}

// 기간을 '10.20(월) – 10.23(목) · 3박 4일'로 쓴다.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const utc = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
};

export function bookingPeriodLabel(b: Pick<BookingInfo, 'start_date' | 'end_date'>): string {
  const nights = Math.round((utc(b.end_date) - utc(b.start_date)) / 86_400_000);
  const fmt = (d: string) => {
    const [, m, dd] = d.split('-').map(Number);
    return `${m}.${dd}(${WEEKDAYS[new Date(utc(d)).getUTCDay()]})`;
  };
  return `${fmt(b.start_date)} – ${fmt(b.end_date)} · ${nights}박 ${nights + 1}일`;
}
