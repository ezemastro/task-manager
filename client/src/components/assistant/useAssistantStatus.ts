// Fetches GET /api/assistant/status once and caches the result in module
// scope, so navigating between protected routes costs no extra request
// (design.md section 9). A network/error failure resolves to `enabled:
// false` — fail closed, matches "render nothing" with zero impact on the
// rest of the app.

import { useEffect, useState } from 'react';
import { getStatus } from './assistantApi';

let cachedEnabled: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

function resolveStatus(): Promise<boolean> {
  if (cachedEnabled !== null) {
    return Promise.resolve(cachedEnabled);
  }
  if (!inFlight) {
    inFlight = getStatus()
      .then((res) => {
        cachedEnabled = res.enabled;
        return cachedEnabled;
      })
      .catch(() => {
        cachedEnabled = false;
        return cachedEnabled;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export interface AssistantStatus {
  enabled: boolean;
  loading: boolean;
}

export function useAssistantStatus(): AssistantStatus {
  const [enabled, setEnabled] = useState<boolean>(cachedEnabled ?? false);
  const [loading, setLoading] = useState<boolean>(cachedEnabled === null);

  useEffect(() => {
    if (cachedEnabled !== null) {
      setEnabled(cachedEnabled);
      setLoading(false);
      return;
    }

    let cancelled = false;
    resolveStatus().then((value) => {
      if (!cancelled) {
        setEnabled(value);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, loading };
}
