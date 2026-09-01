'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3Icon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  WrenchIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  clearSession,
  getServerSnapshot,
  getToken,
  getUserRaw,
  subscribeSession,
} from '@/lib/auth';
import { disconnectSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboardIcon },
  { href: '/bookings', label: 'Bookings', icon: ClipboardListIcon },
  { href: '/mechanics', label: 'Mechanics', icon: WrenchIcon },
  { href: '/analytics', label: 'Analytics', icon: BarChart3Icon },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Session is read from its store, never mirrored into React state. Signing out in another
  // tab therefore takes effect here too, without a refresh.
  const token = useSyncExternalStore(subscribeSession, getToken, getServerSnapshot);
  const userRaw = useSyncExternalStore(subscribeSession, getUserRaw, getServerSnapshot);
  const user = useMemo<User | null>(() => {
    if (!userRaw) return null;
    try {
      return JSON.parse(userRaw) as User;
    } catch {
      return null;
    }
  }, [userRaw]);

  // Client-side guard only. The API rejects unauthenticated requests regardless — this just
  // avoids rendering a shell full of failing panels to someone who is not signed in.
  //
  // The guard reads localStorage LIVE rather than trusting `token`. On the first client render
  // useSyncExternalStore still reports the server snapshot (null) so hydration matches the
  // prerendered HTML, and redirecting on that value bounces a signed-in operator to /login on
  // every hard navigation. Inside an effect we are past hydration and can read the real value.
  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [token, router]);

  function logout() {
    clearSession();
    disconnectSocket();
    router.replace('/login');
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="bg-sidebar hidden w-60 shrink-0 flex-col border-r border-border p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <WrenchIcon className="text-primary size-5" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">Instant Mechanic</span>
        </div>
        <NavLinks />
        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <div className="px-2">
            <p className="truncate text-sm font-medium">{user?.name ?? '—'}</p>
            <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile bar: the sidebar collapses into a sheet below lg. */}
        <header className="bg-background/80 sticky top-0 z-30 flex items-center gap-2 border-b border-border px-4 py-3 backdrop-blur lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
                  <MenuIcon />
                </Button>
              }
            />
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="mb-6 flex items-center gap-2 text-sm font-semibold">
                <WrenchIcon className="text-primary size-5" aria-hidden />
                Instant Mechanic
              </SheetTitle>
              <NavLinks onNavigate={() => setMobileOpen(false)} />
              <Button
                variant="ghost"
                size="sm"
                className="mt-6 w-full justify-start"
                onClick={logout}
              >
                <LogOutIcon data-icon="inline-start" />
                Sign out
              </Button>
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold">Instant Mechanic</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
