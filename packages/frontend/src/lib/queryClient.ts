import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s — data considered fresh
      gcTime: 5 * 60_000, // 5min — unused cache evicted
      retry: 1, // One retry on failure
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
