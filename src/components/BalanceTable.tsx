import { Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { formatKrw, netColor, netSign } from '@/components/Money';
import type { BalanceRow } from '@/types/domain';

type Props = { rows: BalanceRow[]; names: Record<string, string>; colorIndex: Record<string, number> };

// 사람별 낸 돈·부담액·순잔액. 게스트의 순잔액은 서버가 대표자에게 합산하므로 따로 표시하지 않는다.
export function BalanceTable({ rows, names, colorIndex }: Props) {
  const nameOf = (id: string | null | undefined) => names[id ?? ''] ?? '탈퇴한 사용자';
  const guests = rows.filter((r) => r.kind === 'guest');
  const reps = [...new Set(guests.map((g) => nameOf(g.representativeMemberId)))];
  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between px-1 pt-2.5">
        <Text className="font-bold text-base text-ink">사람별 내역</Text>
        <Text className="text-xs text-ink-400">낸 돈 − 부담액</Text>
      </View>
      <View className="rounded-card bg-white px-4 py-1">
        {rows.map((r, i) => {
          const name = nameOf(r.memberId);
          const guest = r.kind === 'guest';
          const abs = formatKrw(Math.abs(r.net));
          return (
            <View
              key={r.memberId}
              className={`flex-row items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-muted' : ''}`}
            >
              <Avatar name={name} colorIndex={colorIndex[r.memberId] ?? 0} guest={guest} size={36} />
              <View className="flex-1 gap-0.5">
                <Text className="font-bold text-[15px] text-ink" numberOfLines={1}>
                  {name}
                  {guest && (
                    <Text className="font-medium text-xs text-ink-400"> 게스트 · 대표 {nameOf(r.representativeMemberId)}</Text>
                  )}
                </Text>
                <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs text-ink-400">
                  낸 돈 {formatKrw(r.paid)} · 부담 {formatKrw(r.owed)}
                </Text>
              </View>
              {guest ? (
                <Text className="text-xs text-ink-400">대표자에게 합산</Text>
              ) : (
                <Text
                  accessibilityLabel={`${abs} ${r.net > 0 ? '받을 돈' : r.net < 0 ? '줄 돈' : '정산할 돈 없음'}`}
                  style={{ fontVariant: ['tabular-nums'] }}
                  className={`font-extrabold text-[15px] ${netColor(r.net)}`}
                >
                  {netSign(r.net)}
                  {abs}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {guests.length > 0 && (
        <Text className="px-1 text-xs leading-[18px] text-ink-400">
          {guests.map((g) => nameOf(g.memberId)).join('·')}(게스트)의 금액은 대표자 {reps.join('·')}님 송금에 합쳐졌어요. 모든
          참여자가 같은 결과를 봐요.
        </Text>
      )}
    </View>
  );
}
