'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type MechanicFilters } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useMechanics(filters: MechanicFilters) {
  return useQuery({
    queryKey: queryKeys.mechanics.list(filters),
    queryFn: () => api.mechanics(filters),
    placeholderData: (prev) => prev,
  });
}
