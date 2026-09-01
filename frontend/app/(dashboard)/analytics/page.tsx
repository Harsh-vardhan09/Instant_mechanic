'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { ChartSkeleton } from '@/components/states/LoadingState';
import {
  useBookingsOverTime,
  useRevenueOverTime,
  useServiceBreakdown,
  useStatusBreakdown,
} from '@/hooks/useAnalytics';
import { STATUS_LABEL, formatCurrency, formatCurrencyCompact } from '@/lib/format';
import type { AnalyticsRange, BookingStatus } from '@/lib/types';

const RANGES: AnalyticsRange[] = ['7d', '30d', '90d'];

/**
 * Semantic where the category is semantic (status), and a single-hue ramp where it is not
 * (service categories). Six unrelated hues on a bar chart is decoration, not information.
 */
const STATUS_COLOR: Record<BookingStatus, string> = {
  PENDING: '#f59e0b',
  ASSIGNED: '#0ea5e9',
  ON_THE_WAY: '#38bdf8',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#10b981',
  CANCELLED: '#ef4444',
};

const ACCENT = 'var(--color-chart-2)';
const RAMP = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

const axis = { stroke: 'var(--color-muted-foreground)', fontSize: 11 };
const tooltipStyle = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--color-popover-foreground)',
};

/** Wraps each chart so one failing panel never blanks the page or renders a silent zero. */
function Panel({
  title,
  isPending,
  isError,
  error,
  retry,
  isEmpty,
  children,
}: {
  title: string;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  retry: () => void;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <ChartSkeleton />
        ) : isError ? (
          <ErrorState error={error} onRetry={retry} compact />
        ) : isEmpty ? (
          <EmptyState variant="no-data" entity="data" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d');

  const bookings = useBookingsOverTime(range);
  const revenue = useRevenueOverTime(range);
  const status = useStatusBreakdown();
  const services = useServiceBreakdown();

  const revenueData = (revenue.data ?? []).map((r) => ({ date: r.date, revenue: Number(r.revenue) }));
  const serviceData = (services.data ?? []).map((s) => ({
    category: s.category,
    count: s.count,
    revenue: Number(s.revenue),
  }));
  const statusData = (status.data ?? []).map((s) => ({
    name: STATUS_LABEL[s.status],
    status: s.status,
    value: s.count,
    percentage: s.percentage,
  }));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Revenue counts completed bookings only.
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === range ? 'default' : 'outline'}
              onClick={() => setRange(r)}
              aria-pressed={r === range}
            >
              {r}
            </Button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title={`Bookings over time (${range})`}
          isPending={bookings.isPending}
          isError={bookings.isError}
          error={bookings.error}
          retry={() => void bookings.refetch()}
          isEmpty={(bookings.data ?? []).length === 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={bookings.data ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="bookingsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="count"
                name="Bookings"
                stroke={ACCENT}
                strokeWidth={2}
                fill="url(#bookingsFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title={`Revenue over time (${range})`}
          isPending={revenue.isPending}
          isError={revenue.isError}
          error={revenue.error}
          retry={() => void revenue.refetch()}
          isEmpty={revenueData.length === 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={revenueData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis
                tick={axis}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCurrencyCompact(v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [formatCurrency(Number(v ?? 0)), 'Revenue']}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke={ACCENT}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Status breakdown"
          isPending={status.isPending}
          isError={status.isError}
          error={status.error}
          retry={() => void status.refetch()}
          isEmpty={statusData.length === 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLOR[entry.status]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, _n, item) => {
                  const p = item.payload as { percentage: number; name: string };
                  return [`${Number(v ?? 0)} (${p.percentage}%)`, p.name];
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => (
                  <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Service category breakdown"
          isPending={services.isPending}
          isError={services.isError}
          error={services.error}
          retry={() => void services.refetch()}
          isEmpty={serviceData.length === 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={serviceData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="category" tick={axis} tickLine={false} axisLine={false} />
              <YAxis
                tick={axis}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCurrencyCompact(v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [formatCurrency(Number(v ?? 0)), 'Revenue']}
              />
              <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
                {serviceData.map((entry, i) => (
                  <Cell key={entry.category} fill={RAMP[i % RAMP.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}
