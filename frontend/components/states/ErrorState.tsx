'use client';

import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Per-panel error state.
 *
 * A panel that fails must say so. The alternative — rendering blank, or worse a zero — is
 * indistinguishable from "there genuinely is no data", and an operator will read a broken
 * revenue panel as a bad day rather than a broken panel.
 */
export function ErrorState({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const message =
    apiError?.message ?? (error instanceof Error ? error.message : 'Something went wrong');
  const canRetry = apiError ? apiError.isRetryable : true;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 text-center',
        compact ? 'p-4' : 'p-8',
        className,
      )}
    >
      <AlertTriangleIcon className="size-5 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load this panel</p>
        <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
        {apiError && apiError.status > 0 && (
          <p className="font-mono text-[11px] text-muted-foreground/70">
            {apiError.status} · {apiError.code}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCwIcon data-icon="inline-start" />
          {canRetry ? 'Retry' : 'Try again'}
        </Button>
      )}
    </div>
  );
}
