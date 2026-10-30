import { useQuery } from '@tanstack/react-query';

import { toKrwPreview } from '@/lib/money';
import { api } from '@/services/api';

// 미리보기 환율. 이 호출이 fx_rates 캐시를 채워 save_expense가 확정에 쓴다(ARCHITECTURE §6.3).
export function useFxPreview(date: string | null, currency: string | null) {
  const query = useQuery({
    queryKey: ['fx', date, currency],
    queryFn: () => api.fxRate(date!, currency!),
    enabled: !!date && !!currency,
  });
  const fx = query.data && 'rate' in query.data ? query.data : null;
  // pending·unsupported면 null(환율 대기 표시)
  const toKrw = (amountOriginal: number): number | null => (fx ? toKrwPreview(amountOriginal, fx.rate) : null);
  return { ...query, fx, toKrw };
}
