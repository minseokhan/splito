// 패키지 예약(하나투어) 입력값 정규화·검증. 서버 응답이 최종 기준이고 여기는 입력 단계 방어다.
import { floorDiv } from './money';

// TODO: 하나투어 실제 예약번호 규격을 확인한 뒤 바꿀 것. 규격이 여러 개면 OR로 허용한다.
export const BOOKING_NO_RE = /^[A-Z]{2}\d{4}-\d{5}$/;

export const BOOKING_NO_MAX = 12;

export function normalizeBookingNo(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase().slice(0, BOOKING_NO_MAX);
}

export function isValidBookingNo(value: string): boolean {
  return BOOKING_NO_RE.test(value);
}

// 예약자 이름은 조회에만 쓰고 방에는 마스킹해서 넣는다(명세 §2-2).
export function maskHolder(name: string): string {
  const n = name.trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${'*'.repeat(n.length - 2)}${n[n.length - 1]}`;
}

// '여행 전' 지출로 등록할 금액. 함께 결제했으면 전액, 내 몫만이면 예약 인원으로 나눈 몫.
export function prepayAmount(paidAmount: number, pax: number, together: boolean): number {
  if (together || pax < 1) return paidAmount;
  return floorDiv(paidAmount, pax);
}

export function perPersonPreview(paidAmount: number, pax: number): number {
  return pax < 1 ? paidAmount : floorDiv(paidAmount, pax);
}
