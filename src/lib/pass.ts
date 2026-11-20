// 여행 패스(유료). 구매 여부는 room_passes(방마다 한 행)가 정한다. 결제 연동·방당 무료 AI 5건 집계는 아직 없다.
// ponytail: 금액은 그대로 내려받고 화면에서만 가린다. 실제 유료화 때는 서버가 무료 사용자에게 금액을 주지 않아야 한다(핸드오프 README).
import { formatKrw } from './money';

export const PASS_PRICE = 5400;
export const FREE_AI_LIMIT = 5;
// ponytail: 방별 AI 인식 건수 데이터가 없어 시안 값으로 둔다. ai_usage를 방·누적 기준으로 세면 바꾼다.
export const DEMO_AI_USED = 3;

export type PassReason = 'stats' | 'ai';
export const PASS_REASON: Record<PassReason, string> = {
  stats: '내 통계는 여행 패스 기능이에요',
  ai: `무료 AI 인식 ${FREE_AI_LIMIT}건을 모두 썼어요`,
};

/** '35,300원' 같은 금액을 '???원'으로 가린다. */
export function maskWon(text: string): { text: string; count: number } {
  let count = 0;
  return {
    text: text.replace(/[0-9][0-9,]*원/g, () => {
      count++;
      return '???원';
    }),
    count,
  };
}

/** 내 통계 하단 잠금 바의 '숨겨진 금액 N개' — 화면에서 ???로 바꾼 자리 수. 흐리게만 한 값(막대 위 금액·카테고리 합계)은 세지 않는다.
 *  전날 대비 문장의 금액 + 하루 권장 금액 + 카테고리마다 금액·비율 + 다른 동행마다 결제·쓴 돈. */
export function hiddenCount(p: { compareTop: string; baseline: boolean; categories: number; others: number }): number {
  return maskWon(p.compareTop).count + (p.baseline ? 1 : 0) + p.categories * 2 + p.others * 2;
}

export function aiChip(used: number, on: boolean): { text: string; tone: 'pass' | 'free' | 'out' } {
  if (on) return { text: '여행 패스 · AI 인식 무제한', tone: 'pass' };
  const left = Math.max(0, FREE_AI_LIMIT - used);
  return left ? { text: `무료 AI 인식 ${left}건 남음`, tone: 'free' } : { text: '무료 AI 인식을 모두 썼어요', tone: 'out' };
}

export function passRow(p: { on: boolean; used: number; owner: boolean; paidBy?: string; splitDone?: boolean }) {
  if (p.on) {
    return {
      title: '여행 패스 이용 중',
      sub: `${p.paidBy ?? ''} 결제 · ${formatKrw(PASS_PRICE)}${p.splitDone ? ' · 정산에 1/N 포함' : ''}`,
      button: null,
    };
  }
  return { title: '무료 이용 중', sub: `AI 인식 ${p.used}/${FREE_AI_LIMIT}건 사용`, button: p.owner ? '업그레이드' : '요청하기' };
}

/** 패스 값을 동행과 1/N로 나눌 때 1인 몫(원, 내림). */
export function splitShare(n: number): number {
  return n > 0 ? Math.floor(PASS_PRICE / n) : PASS_PRICE;
}
