'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  FilterXIcon,
  Loader2Icon,
  SearchIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { BookingDetailSheet } from '@/components/dashboard/BookingDetailSheet';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { TableSkeleton } from '@/components/states/LoadingState';
import { useBookings } from '@/hooks/useBookings';
import { useMechanics } from '@/hooks/useMechanics';
import { useDebounce } from '@/hooks/useDebounce';
import { api, type BookingFilters } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { BOOKING_STATUSES, STATUS_LABEL, formatCurrency, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Booking } from '@/lib/types';

const SORTABLE = [
  { key: 'createdAt', label: 'Created' },
  { key: 'scheduledAt', label: 'Scheduled' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
] as const;

const PAGE_SIZES = [10, 20, 50, 100] as const;

const selectClass =
  'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

export function BookingsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // ── ALL filter state lives in the URL ──────────────────────────────────────
  // A filtered view is then shareable, survives a refresh, and the browser's back button
  // steps through filter changes the way an operator expects.
  const filters: BookingFilters = useMemo(
    () => ({
      page: Number(searchParams.get('page') ?? 1),
      limit: Number(searchParams.get('limit') ?? 20),
      sort: searchParams.get('sort') ?? 'createdAt',
      order: searchParams.get('order') ?? 'desc',
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      mechanicId: searchParams.get('mechanicId') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
    }),
    [searchParams],
  );

  const setParams = useCallback(
    (patch: Record<string, string | number | undefined>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage && !('page' in patch)) next.delete('page');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Search is typed locally and pushed to the URL only after the user pauses.
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (debouncedSearch === current) return;
    setParams({ search: debouncedSearch || undefined });
  }, [debouncedSearch, searchParams, setParams]);

  const { data, isPending, isFetching, isError, error, refetch } = useBookings(filters);
  const { data: mechanicsData } = useMechanics({ limit: 100, sort: 'name', order: 'asc' });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hasFilters = Boolean(
    filters.search || filters.status || filters.mechanicId || filters.dateFrom || filters.dateTo,
  );

  const clearFilters = () => {
    setSearchInput('');
    router.replace(pathname, { scroll: false });
  };

  const toggleSort = (key: string) => {
    const nextOrder = filters.sort === key && filters.order === 'desc' ? 'asc' : 'desc';
    setParams({ sort: key, order: nextOrder });
  };

  // ── CSV export of the CURRENT filtered view ────────────────────────────────
  const exportCsv = useMutation({
    mutationFn: async () => {
      const rows: Booking[] = [];
      // Walks the filtered set page by page rather than exporting only what is on screen —
      // "export this view" meaning "export page 3 of 33" would be a quietly wrong file.
      // Capped so a stray unfiltered export cannot pull the whole table down a phone tether.
      for (let page = 1; page <= 20; page++) {
        const res = await api.bookings({ ...filters, page, limit: 100 });
        rows.push(...res.data);
        if (page >= res.meta.totalPages) break;
      }
      return rows;
    },
    onSuccess: (rows) => {
      const header = [
        'code',
        'status',
        'customer',
        'phone',
        'vehicle',
        'regNumber',
        'service',
        'category',
        'mechanic',
        'amount',
        'scheduledAt',
        'createdAt',
      ];
      const escape = (v: string) => `"${v.replaceAll('"', '""')}"`;
      const lines = [
        header.join(','),
        ...rows.map((b) =>
          [
            b.code,
            b.status,
            b.customer?.name ?? '',
            b.customer?.phone ?? '',
            `${b.vehicle?.make ?? ''} ${b.vehicle?.model ?? ''}`.trim(),
            b.vehicle?.regNumber ?? '',
            b.service?.name ?? '',
            b.service?.category ?? '',
            b.mechanic?.name ?? '',
            b.amount,
            b.scheduledAt,
            b.createdAt,
          ]
            .map((v) => escape(String(v)))
            .join(','),
        ),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} bookings`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Export failed'),
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground text-sm">
            {meta ? `${meta.total.toLocaleString('en-IN')} total` : 'Loading…'}
            {isFetching && !isPending && <span className="ml-2 opacity-60">refreshing…</span>}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsv.mutate()}
          disabled={exportCsv.isPending || rows.length === 0}
        >
          {exportCsv.isPending ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <DownloadIcon data-icon="inline-start" />
          )}
          Export CSV
        </Button>
      </header>

      {/* ── filters ── */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="search" className="text-xs">
              Search
            </Label>
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="search"
                className="pl-8"
                placeholder="Code, customer, or reg number"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status" className="text-xs">
              Status
            </Label>
            <select
              id="status"
              className={selectClass}
              value={filters.status ?? ''}
              onChange={(e) => setParams({ status: e.target.value || undefined })}
            >
              <option value="">All statuses</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mechanic" className="text-xs">
              Mechanic
            </Label>
            <select
              id="mechanic"
              className={selectClass}
              value={filters.mechanicId ?? ''}
              onChange={(e) => setParams({ mechanicId: e.target.value || undefined })}
            >
              <option value="">All mechanics</option>
              {(mechanicsData?.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="dateFrom" className="text-xs">
                From
              </Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setParams({
                    dateFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateTo" className="text-xs">
                To
              </Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setParams({
                    dateTo: e.target.value
                      ? new Date(`${e.target.value}T23:59:59`).toISOString()
                      : undefined,
                  })
                }
              />
            </div>
          </div>

          {hasFilters && (
            <div className="flex items-end lg:col-span-5">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <FilterXIcon data-icon="inline-start" />
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── results ── */}
      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          variant={hasFilters ? 'no-results' : 'no-data'}
          entity="bookings"
          onClearFilters={clearFilters}
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden py-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Code</th>
                    <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                    <th className="px-4 py-2.5 text-left font-medium">Vehicle</th>
                    <th className="px-4 py-2.5 text-left font-medium">Service</th>
                    <th className="px-4 py-2.5 text-left font-medium">Mechanic</th>
                    {SORTABLE.filter((s) => s.key === 'status' || s.key === 'amount').map((s) => (
                      <th key={s.key} className="px-4 py-2.5 text-left font-medium">
                        <button
                          className="hover:text-foreground text-muted-foreground inline-flex items-center gap-1"
                          onClick={() => toggleSort(s.key)}
                        >
                          {s.label}
                          {filters.sort === s.key &&
                            (filters.order === 'asc' ? (
                              <ArrowUpIcon className="size-3" />
                            ) : (
                              <ArrowDownIcon className="size-3" />
                            ))}
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-left font-medium">
                      <button
                        className="hover:text-foreground text-muted-foreground inline-flex items-center gap-1"
                        onClick={() => toggleSort('createdAt')}
                      >
                        Created
                        {filters.sort === 'createdAt' &&
                          (filters.order === 'asc' ? (
                            <ArrowUpIcon className="size-3" />
                          ) : (
                            <ArrowDownIcon className="size-3" />
                          ))}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedId(b.id)}
                      className="hover:bg-muted/40 cursor-pointer border-b border-border/60 transition-colors last:border-0"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs">{b.code}</td>
                      <td className="px-4 py-2.5">
                        <div className="max-w-[10rem] truncate">{b.customer?.name ?? '—'}</div>
                        <div className="text-muted-foreground text-xs">{b.customer?.city}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="max-w-[10rem] truncate">
                          {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : '—'}
                        </div>
                        <div className="text-muted-foreground font-mono text-xs">
                          {b.vehicle?.regNumber}
                        </div>
                      </td>
                      <td className="max-w-[11rem] truncate px-4 py-2.5">
                        {b.service?.name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {b.mechanic?.name ?? (
                          <span className="text-muted-foreground italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatCurrency(b.amount)}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 text-xs whitespace-nowrap">
                        {formatDateTime(b.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile: the table becomes stacked cards. A horizontally scrolling 8-column table
              on a 375px screen is unusable, so it is not offered. */}
          <div className="space-y-3 md:hidden">
            {rows.map((b) => (
              <Card key={b.id} onClick={() => setSelectedId(b.id)} className="cursor-pointer">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{b.code}</span>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="text-sm font-medium">{b.customer?.name ?? '—'}</div>
                  <div className="text-muted-foreground text-xs">
                    {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model} · ${b.vehicle.regNumber}` : '—'}
                  </div>
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-muted-foreground">{b.service?.name}</span>
                    <span className="font-medium tabular-nums">{formatCurrency(b.amount)}</span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {b.mechanic?.name ?? 'Unassigned'} · {formatDateTime(b.createdAt)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── pagination ── */}
          {meta && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="limit" className="text-muted-foreground text-xs">
                  Rows
                </Label>
                <select
                  id="limit"
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={meta.limit}
                  onChange={(e) => setParams({ limit: e.target.value })}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground text-xs">
                  Page {meta.page} of {meta.totalPages || 1} · {meta.total.toLocaleString('en-IN')}{' '}
                  results
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => setParams({ page: meta.page - 1 }, false)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setParams({ page: meta.page + 1 }, false)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <BookingDetailSheet
        bookingId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onChanged={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        }}
      />
    </div>
  );
}

export const bookingsViewClass = cn();
