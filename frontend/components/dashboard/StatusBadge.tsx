'use client';

import { cn } from '@/lib/utils';
import {
  MECHANIC_STATUS_LABEL,
  MECHANIC_STATUS_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
} from '@/lib/format';
import type { BookingStatus, MechanicStatus } from '@/lib/types';

/** Colour is a second channel, never the only one — the label always carries the meaning. */
export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        STATUS_STYLE[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function MechanicStatusBadge({
  status,
  className,
}: {
  status: MechanicStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        MECHANIC_STATUS_STYLE[status],
        className,
      )}
    >
      {MECHANIC_STATUS_LABEL[status]}
    </span>
  );
}
