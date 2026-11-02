// 게스트 표기(PRD §7.2). 게스트는 자기 순잔액으로 따로 정산하고, 대표자가 대신 눌러주고 알려준다.
export function repChangeWarning(guestName: string, newRepName: string): string {
  return `이제 ${newRepName} 님이 ${guestName}의 송금을 대신 기록하고 알려줘요`;
}
