'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ErrorState } from '@/components/states/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useBooking } from '@/hooks/useBookings';
import { ApiError, api } from '@/lib/api';
import { STATUS_LABEL, formatCurrency, formatDateTime } from '@/lib/format';
import type { BookingStatus } from '@/lib/types';

/**
 * The legal next statuses, mirroring the server's state machine.
 *
 * This is a UX convenience, not the enforcement point — the server rejects an illegal
 * transition with 409 regardless of what this UI offers. Hiding a button is never access
 * control, and the same logic applies to correctness.
 */
const NEXT_STATUSES: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CANCELLED'],
  ASSIGNED: ['ON_THE_WAY', 'CANCELLED'],
  ON_THE_WAY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function BookingDetailSheet({
  bookingId,
  onOpenChange,
  onChanged,
}: {
  bookingId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { data, isPending, isError, error, refetch } = useBooking(bookingId);

  const changeStatus = useMutation({
    mutationFn: ({ status }: { status: BookingStatus }) =>
      api.changeStatus(bookingId as string, status),
    onSuccess: (booking) => {
      toast.success(`${booking.code} → ${STATUS_LABEL[booking.status]}`);
      onChanged();
    },
    onError: (err) => {
      // A 409 here is the state machine refusing — show the server's message verbatim,
      // it names the current status and the legal next ones.
      const message = err instanceof ApiError ? err.message : 'Could not update booking';
      toast.error(message);
    },
  });

  return (
    <Sheet open={Boolean(bookingId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-mono text-base">{data?.code ?? 'Booking'}</SheetTitle>
          <SheetDescription>
            {data ? `${data.service?.name ?? 'Service'} · ${formatCurrency(data.amount)}` : 'Loading…'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} compact />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <StatusBadge status={data.status} />
                <span className="text-muted-foreground text-xs">
                  updated {formatDateTime(data.updatedAt)}
                </span>
              </div>

              {NEXT_STATUSES[data.status].length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {NEXT_STATUSES[data.status].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === 'CANCELLED' ? 'destructive' : 'default'}
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ status: s })}
                    >
                      {changeStatus.isPending && (
                        <Loader2Icon data-icon="inline-start" className="animate-spin" />
                      )}
                      Mark {STATUS_LABEL[s].toLowerCase()}
                    </Button>
                  ))}
                </div>
              )}

              <Separator />

              <dl className="grid grid-cols-2 gap-4">
                <Field label="Customer" value={data.customer?.name ?? '—'} />
                <Field label="Phone" value={data.customer?.phone ?? '—'} />
                <Field label="City" value={data.customer?.city ?? '—'} />
                <Field
                  label="Vehicle"
                  value={
                    data.vehicle ? `${data.vehicle.make} ${data.vehicle.model}` : '—'
                  }
                />
                <Field label="Reg. number" value={data.vehicle?.regNumber ?? '—'} />
                <Field label="Service" value={data.service?.name ?? '—'} />
                <Field label="Mechanic" value={data.mechanic?.name ?? 'Unassigned'} />
                <Field label="Amount" value={formatCurrency(data.amount)} />
                <Field label="Scheduled" value={formatDateTime(data.scheduledAt)} />
                <Field
                  label="Completed"
                  value={data.completedAt ? formatDateTime(data.completedAt) : '—'}
                />
              </dl>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-sm font-medium">Timeline</h3>
                <ol className="space-y-3">
                  {data.timeline.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="bg-primary/60 mt-1.5 size-2 shrink-0 rounded-full" />
                        <span className="bg-border w-px flex-1" />
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <p className="text-sm">
                          {e.fromStatus ? `${STATUS_LABEL[e.fromStatus]} → ` : ''}
                          <span className="font-medium">{STATUS_LABEL[e.toStatus]}</span>
                        </p>
                        {e.note && <p className="text-muted-foreground text-xs">{e.note}</p>}
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(e.createdAt)} · {e.actor?.email ?? 'system'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
