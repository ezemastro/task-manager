// sessionStorage-backed scroll restoration keyed by route. Each visit
// records {token, y} on scroll; when the caller signals the content is
// ready, the position is restored ONLY if the token matches the current
// history entry (i.e. the user navigated back to this same view via history
// POP). A fresh visit or a hard reload has a different token and therefore
// never restores — the view starts at the top, as expected.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const MAX_RESTORE_ATTEMPTS = 20;

interface StoredScrollPosition {
  token: string;
  y: number;
}

function storageKey(route: string): string {
  return `scrollRestoration:${route}`;
}

export function useScrollRestoration(route: string, ready: boolean): void {
  const location = useLocation();

  useEffect(() => {
    const key = storageKey(route);
    const handleScroll = () => {
      try {
        const position: StoredScrollPosition = { token: location.key, y: window.scrollY };
        sessionStorage.setItem(key, JSON.stringify(position));
      } catch {
        // Storage can be unavailable or read-only in restricted contexts.
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [route, location.key]);

  useEffect(() => {
    if (!ready) return;

    let stored: StoredScrollPosition | null = null;
    try {
      const raw = sessionStorage.getItem(storageKey(route));
      if (raw) {
        const candidate = JSON.parse(raw) as Partial<StoredScrollPosition>;
        if (
          typeof candidate.token === 'string' &&
          typeof candidate.y === 'number' &&
          Number.isFinite(candidate.y) &&
          candidate.y >= 0
        ) {
          stored = { token: candidate.token, y: candidate.y };
        }
      }
    } catch {
      // Ignore malformed or unreadable storage.
    }
    if (!stored || stored.token !== location.key) return;

    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      if (cancelled) return;
      const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(stored!.y, maximum));
      attempts += 1;
      if (attempts >= MAX_RESTORE_ATTEMPTS) return;
      frame = window.requestAnimationFrame(restore);
    };
    frame = window.requestAnimationFrame(restore);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [ready, route, location.key]);
}