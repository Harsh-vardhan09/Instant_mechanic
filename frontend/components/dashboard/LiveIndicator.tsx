'use client';

import { cn } from '@/lib/utils';

/**
 * Connection state, always visible.
 *
 * The rule this enforces: never show numbers that might be stale without saying so. When the
 * socket drops, the figures on screen are a snapshot of whenever it dropped, and an operator
 * dispatching against them deserves to know that before they act.
 */
export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        connected
          ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400'
          : 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400',
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {connected && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            connected ? 'bg-emerald-500' : 'bg-amber-500',
          )}
        />
      </span>
      {connected ? 'Live' : 'Reconnecting'}
    </span>
  );
}
