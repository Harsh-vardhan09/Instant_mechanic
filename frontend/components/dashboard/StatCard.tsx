'use client';

import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One headline number, its label, and how it moved.
 *
 * `change` is `null` when there is no honest baseline — the API returns null rather than
 * inventing 100% growth from a zero starting point, and this renders that as "—" instead of
 * quietly showing 0%, which would read as "flat" when the truth is "unknown".
 */
export function StatCard({
  label,
  value,
  change,
  invertChange = false,
  hint,
}: {
  label: string;
  value: string;
  change: number | null;
  /** For metrics where up is bad — cancellations rising is not good news. */
  invertChange?: boolean;
  hint?: string;
}) {
  const hasChange = change !== null && Number.isFinite(change);
  const flat = hasChange && Math.abs(change) < 0.05;
  const positive = hasChange && change > 0;
  const good = invertChange ? !positive : positive;

  return (
    <Card className="gap-0 py-4">
      <CardHeader className="px-4 pb-1">
        <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          {!hasChange ? (
            <span className="text-muted-foreground" title={hint ?? 'No comparable previous period'}>
              —
            </span>
          ) : flat ? (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <MinusIcon className="size-3" aria-hidden />
              no change
            </span>
          ) : (
            <span
              className={cn(
                'flex items-center gap-0.5 font-medium',
                good
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400',
              )}
            >
              {positive ? (
                <ArrowUpRightIcon className="size-3" aria-hidden />
              ) : (
                <ArrowDownRightIcon className="size-3" aria-hidden />
              )}
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {hasChange && <span className="text-muted-foreground">vs prev. period</span>}
        </div>
      </CardContent>
    </Card>
  );
}
