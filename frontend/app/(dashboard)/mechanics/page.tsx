'use client';

import { useState } from 'react';
import { SearchIcon, StarIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MechanicStatusBadge, StatusBadge } from '@/components/dashboard/StatusBadge';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { CardGridSkeleton } from '@/components/states/LoadingState';
import { useMechanics } from '@/hooks/useMechanics';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { MechanicStatus } from '@/lib/types';

const STATUSES: { value: '' | MechanicStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'ON_JOB', label: 'On job' },
  { value: 'OFF_DUTY', label: 'Off duty' },
];

export default function MechanicsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | MechanicStatus>('');
  const debounced = useDebounce(search, 300);

  const filters = {
    limit: 100,
    sort: 'name',
    order: 'asc',
    ...(debounced ? { search: debounced } : {}),
    ...(status ? { status } : {}),
  };

  const { data, isPending, isError, error, refetch } = useMechanics(filters);
  const rows = data?.data ?? [];
  const hasFilters = Boolean(debounced || status);

  const clear = () => {
    setSearch('');
    setStatus('');
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Mechanics</h1>
        <p className="text-muted-foreground text-sm">
          {data ? `${data.meta.total} on the roster` : 'Loading…'}
        </p>
      </header>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="m-search" className="text-xs">
              Search
            </Label>
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="m-search"
                className="pl-8"
                placeholder="Name, email or phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-status" className="text-xs">
              Status
            </Label>
            <select
              id="m-status"
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | MechanicStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <div className="sm:col-span-3">
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isPending ? (
        <CardGridSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          variant={hasFilters ? 'no-results' : 'no-data'}
          entity="mechanics"
          onClearFilters={clear}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => (
            <Card key={m.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{m.specialisation}</p>
                  </div>
                  <MechanicStatusBadge status={m.status} />
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <StarIcon className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                    <span className="tabular-nums">{m.rating}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatNumber(m.jobsCompleted)} jobs completed
                  </span>
                </div>

                <div className="border-t border-border pt-3">
                  {m.currentBooking ? (
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs">
                        {m.currentBooking.isActive ? 'Current job' : 'Last job'}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{m.currentBooking.code}</span>
                        <StatusBadge status={m.currentBooking.status} />
                      </div>
                      <div className="text-muted-foreground flex items-center justify-between text-xs">
                        <span className="truncate">
                          {m.currentBooking.customerName ?? 'Unknown customer'}
                        </span>
                        <span className="tabular-nums">
                          {formatCurrency(m.currentBooking.amount)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs italic">No bookings yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
