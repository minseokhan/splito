import { Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { formatKrw, Money } from '@/components/Money';
import type { BalanceRow } from '@/types/domain';

type Props = { rows: BalanceRow[]; names: Record<string, string>; colorIndex: Record<string, number> };

// 사람별 낸 돈·부담액·순잔액. 게스트의 순잔액은 서버가 대표자에게 합산하므로 따로 표시하지 않는다.
export function BalanceTable({ rows, names, colorIndex }: Props) {
  return (
    <View className="rounded-lg border border-line">
      {rows.map((r, i) => {
        const name = names[r.memberId] ?? '탈퇴한 사용자';
        const guest = r.kind === 'guest';
        return (
          <View
            key={r.memberId}
            className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-divider' : ''}`}
          >
            <Avatar name={name} colorIndex={colorIndex[r.memberId] ?? 0} guest={guest} size={32} />
            <View className="flex-1">
              <Text className="font-semibold text-[15px] text-ink-900" numberOfLines={1}>
                {guest ? `${name}(게스트 · 대표 ${names[r.representativeMemberId ?? ''] ?? ''})` : name}
              </Text>
              <Text style={{ fontVariant: ['tabular-nums'] }} className="text-[13px] text-ink-500">
                낸 돈 {formatKrw(r.paid)} · 부담액 {formatKrw(r.owed)}
              </Text>
            </View>
            {guest ? (
              <Text className="text-[13px] text-ink-500">대표자에게 합산</Text>
            ) : (
              <Money net={r.net} />
            )}
          </View>
        );
      })}
    </View>
  );
}
