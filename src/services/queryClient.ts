import { QueryClient } from '@tanstack/react-query';

function isClientError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

// ARCHITECTURE §7·§8: 읽기는 3회 재시도(4xx 제외, 지수 백오프는 기본값), mutation은 재시도하지 않는다.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => !isClientError(error) && failureCount < 3,
    },
    mutations: { retry: 0 },
  },
});
