'use client';

import { FilterXIcon, InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Two genuinely different situations, deliberately not sharing copy:
 *
 *  - "no data yet"      — the system is empty. Nothing the operator did caused this.
 *  - "no results"       — their filters excluded everything, and the fix is one click away.
 *
 * Showing "No bookings found" for both is how someone concludes the business has no bookings
 * when in fact they left a status filter on from twenty minutes ago.
 */
export function EmptyState({
  variant,
  entity,
  onClearFilters,
  className,
}: {
  variant: 'no-data' | 'no-results';
  entity: string;
  onClearFilters?: () => void;
  className?: string;
}) {
  const filtered = variant === 'no-results';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center',
        className,
      )}
    >
      {filtered ? (
        <FilterXIcon className="size-6 text-muted-foreground" aria-hidden />
      ) : (
        <InboxIcon className="size-6 text-muted-foreground" aria-hidden />
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {filtered ? `No ${entity} match these filters` : `No ${entity} yet`}
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {filtered
            ? 'Nothing matched the current search and filters. Try widening them.'
            : `Once ${entity} exist they will appear here.`}
        </p>
      </div>
      {filtered && onClearFilters && (
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          <FilterXIcon data-icon="inline-start" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
