// Tiny subscribe/emit refetch bus (design.md section "Refetch Bus"). There is
// no react-query/SWR/global cache in this app — each page owns its own
// `useState` + `useEffect` + refetch callback. The bus reuses those existing
// callbacks instead of introducing a data layer.
//
// The provider holds subscribers in a `useRef<Map>`, never `useState`, so
// `emit()` never re-renders the provider or anything above it.
//
// Hint vocabulary (server-emitted, exact string match only — no wildcards):
// collections `projects`, `stages`, `clients`, `tags`, `comments`, `summary`,
// `users`; specifics `project:<id>`, `stage:<id>`. A page that has not
// registered for a hint is simply not in the map — `emit` is then a no-op
// for that page, and it picks up the change on its next mount. This is a
// deliberate degradation, not a bug: `window.location.reload()` is never
// used here, since it would destroy the conversation.

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';

type RefetchFn = () => void;

export interface AssistantDataBusValue {
  subscribe: (keys: string[], fn: RefetchFn) => () => void;
  emit: (keys: string[]) => void;
}

const AssistantDataBusContext = createContext<AssistantDataBusValue | null>(null);

export function AssistantDataBusProvider({ children }: { children: ReactNode }) {
  const subscribersRef = useRef<Map<string, Set<RefetchFn>>>(new Map());

  const subscribe = useCallback((keys: string[], fn: RefetchFn) => {
    const map = subscribersRef.current;
    for (const key of keys) {
      let set = map.get(key);
      if (!set) {
        set = new Set();
        map.set(key, set);
      }
      set.add(fn);
    }
    return () => {
      for (const key of keys) {
        const set = map.get(key);
        if (!set) continue;
        set.delete(fn);
        if (set.size === 0) map.delete(key);
      }
    };
  }, []);

  const emit = useCallback((keys: string[]) => {
    const map = subscribersRef.current;
    const fired = new Set<RefetchFn>();
    for (const key of keys) {
      const set = map.get(key);
      if (!set) continue;
      for (const fn of set) {
        if (fired.has(fn)) continue;
        fired.add(fn);
        fn();
      }
    }
  }, []);

  return <AssistantDataBusContext.Provider value={{ subscribe, emit }}>{children}</AssistantDataBusContext.Provider>;
}

/** Returns `null` outside a provider — callers must degrade gracefully, never throw. */
// eslint-disable-next-line react-refresh/only-export-components -- design.md keeps the provider and its two consumer hooks in one file; this only affects dev Fast Refresh, not production behavior.
export function useAssistantDataBus(): AssistantDataBusValue | null {
  return useContext(AssistantDataBusContext);
}

/**
 * Subscribes `refetch` to `keys` for the lifetime of the calling component.
 * `refetch` is stored in a ref so an inline arrow passed by the caller does
 * not force a resubscribe on every render — only a change to the joined key
 * set does. A no-op outside `AssistantDataBusProvider` (e.g. in tests).
 */
// eslint-disable-next-line react-refresh/only-export-components -- design.md keeps the provider and its two consumer hooks in one file; this only affects dev Fast Refresh, not production behavior.
export function useAssistantRefetch(keys: string[], refetch: RefetchFn): void {
  const bus = useAssistantDataBus();
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const keySignature = keys.join('|');

  useEffect(() => {
    if (!bus) return;
    const stableFn: RefetchFn = () => refetchRef.current();
    return bus.subscribe(keySignature.split('|'), stableFn);
  }, [bus, keySignature]);
}
