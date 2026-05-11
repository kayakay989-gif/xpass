import { useEffect, useState, useRef } from 'react';

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Avoids indefinite "Loading membership…" when `subscriptions.getCurrent` hangs (slow network / cold API).
 * After `timeoutMs`, treat membership as ready so the user can browse plans or see "no subscription".
 */
export function useMembershipUiReady(params: {
  enabled: boolean;
  isPending: boolean;
  /** When this changes (e.g. user switch), reset the timeout gate. */
  resetKey?: string | null;
  timeoutMs?: number;
}): { blockForMembershipLoad: boolean; timedOut: boolean } {
  const { enabled, isPending, resetKey, timeoutMs = DEFAULT_TIMEOUT_MS } = params;
  const [timedOut, setTimedOut] = useState(false);
  const keyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKey !== keyRef.current) {
      keyRef.current = resetKey;
      setTimedOut(false);
    }
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) {
      setTimedOut(false);
      return;
    }
    if (!isPending) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [enabled, isPending, timeoutMs]);

  const blockForMembershipLoad = enabled && isPending && !timedOut;
  return { blockForMembershipLoad, timedOut };
}
