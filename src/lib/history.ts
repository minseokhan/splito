// 댓글 시각 "10/22 21:14"(기기 현지 시각).
export function historyStamp(iso: string): string {
  const t = new Date(iso);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${t.getMonth() + 1}/${t.getDate()} ${hh}:${mm}`;
}
