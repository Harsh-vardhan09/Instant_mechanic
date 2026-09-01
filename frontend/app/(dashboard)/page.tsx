'use client';

import { useEffect, useRef, useState } from 'react';
import { ActivityIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/StatCard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { LiveIndicator } from '@/components/dashboard/LiveIndicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { FeedSkeleton, StatCardsSkeleton } from '@/components/states/LoadingState';
import { useDashboard } from '@/hooks/useDashboard';
import { useRealtime, type ActivityItem } from '@/hooks/useRealtime';
import { formatCurrencyCompact, formatNumber, formatRelative, formatTime } from '@/lib/format';

/** A row that flashes once when it arrives, then settles. Movement draws the eye to what changed. */
function ActivityRow({ item, isNew }: { item: ActivityItem; isNew: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors duration-1000 ${
        isNew ? 'bg-primary/10' : 'bg-transparent'
      }`}
    >
      <StatusBadge status={item.status} />
      <span className="truncate font-mono text-xs">{item.code}</span>
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
        {item.customerName ?? 'Unknown customer'}
        {item.mechanicName ? ` · ${item.mechanicName}` : ''}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {formatRelative(item.at)}
      </span>
    </li>
  );
}

export default function OverviewPage() {
  const { data, isPending, isError, error, refetch, dataUpdatedAt } = useDashboard();
  const { connected, activity } = useRealtime();

  // Track which feed ids are new so the highlight fires once rather than on every render.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh = activity.filter((a) => !seen.current.has(a.id)).map((a) => a.id);
    if (fresh.length === 0) return;
    fresh.forEach((id) => seen.current.add(id));
    setNewIds((prev) => new Set([...prev, ...fresh]));
    const t = setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.delete(id));
        return next;
      });
    }, 1_500);
    return () => clearTimeout(t);
  }, [activity]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm">
            {/* Never a number without a signal of how fresh it is. */}
            Data as of{' '}
            <span className="tabular-nums">
              {data ? formatTime(data.generatedAt) : dataUpdatedAt ? formatTime(new Date(dataUpdatedAt).toISOString()) : '—'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveIndicator connected={connected} />
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {isPending ? (
        <StatCardsSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total bookings"
            value={formatNumber(data.totalBookings)}
            change={data.changes.totalBookings}
          />
          <StatCard
            label="Today"
            value={formatNumber(data.todayBookings)}
            change={data.changes.todayBookings}
          />
          <StatCard
            label="Completed"
            value={formatNumber(data.completedBookings)}
            change={data.changes.completedBookings}
          />
          <StatCard
            label="Pending"
            value={formatNumber(data.pendingBookings)}
            change={data.changes.pendingBookings}
            invertChange
          />
          <StatCard
            label="Cancelled"
            value={formatNumber(data.cancelledBookings)}
            change={data.changes.cancelledBookings}
            invertChange
          />
          <StatCard
            label="Total revenue"
            value={formatCurrencyCompact(data.totalRevenue)}
            change={data.changes.totalRevenue}
          />
          <StatCard
            label="Active mechanics"
            value={formatNumber(data.activeMechanics)}
            change={data.changes.activeMechanics}
            hint="Point-in-time count — no history is kept, so there is no comparable previous period."
          />
          <StatCard
            label="New customers (30d)"
            value={formatNumber(data.newCustomers)}
            change={data.changes.newCustomers}
          />
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ActivityIcon className="size-4" aria-hidden />
            Recent activity
          </CardTitle>
          <span className="text-muted-foreground text-xs">
            {connected ? 'Streaming live' : 'Waiting for connection'}
          </span>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            connected ? (
              <EmptyState variant="no-data" entity="activity" />
            ) : (
              <FeedSkeleton />
            )
          ) : (
            <ul className="space-y-1">
              {activity.map((item) => (
                <ActivityRow key={item.id} item={item} isNew={newIds.has(item.id)} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
