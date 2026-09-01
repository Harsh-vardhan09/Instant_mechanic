import { Suspense } from 'react';
import { BookingsView } from '@/components/dashboard/BookingsView';
import { TableSkeleton } from '@/components/states/LoadingState';

/**
 * The Suspense boundary is required, not decorative: BookingsView calls useSearchParams, and
 * a production build of a static route fails outright if that is not wrapped
 * ("Missing Suspense boundary with useSearchParams"). It also lets the shell prerender while
 * the URL-driven part renders on the client.
 */
export default function BookingsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <BookingsView />
    </Suspense>
  );
}
