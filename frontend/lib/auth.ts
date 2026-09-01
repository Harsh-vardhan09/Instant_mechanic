'use client';

/**
 * Token storage. localStorage keeps the session across refreshes, which is what an ops tool
 * open all day needs.
 *
 * Trade-off, stated plainly: a token in localStorage is readable by any script running on this
 * origin, so it is XSS-exposed in a way an httpOnly cookie is not. The API is a separate origin
 * (AWS) from the app (Vercel), so cookie auth would need cross-site cookies plus CSRF handling.
 * For an internal tool behind a login this is the accepted trade — revisit if the dashboard
 * ever renders untrusted content.
 */
const TOKEN_KEY = 'im.token';
const USER_KEY = 'im.user';

/**
 * Session is external mutable state, so components read it through useSyncExternalStore
 * rather than copying it into React state inside an effect. That keeps one source of truth
 * and avoids the cascading render an effect-then-setState pattern causes.
 */
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeSession(onChange: () => void): () => void {
  listeners.add(onChange);
  // 'storage' fires in OTHER tabs — signing out in one tab signs out the rest.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Snapshot getters return primitives, so repeated calls are referentially stable. */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUserRaw(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(USER_KEY);
}

export const getServerSnapshot = (): null => null;

export function setSession(token: string, user: unknown): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  emit();
}

export function getUser<T>(): T | null {
  const raw = getUserRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  emit();
}
