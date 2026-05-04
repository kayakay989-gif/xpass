import { InteractionManager, Platform } from 'react-native';
import { router } from 'expo-router';
import { agentLog } from '@/lib/agent-debug-log';

/**
 * Defers `router.replace` until after interactions + paint to avoid Expo Router briefly
 * matching no route (404 flash) right after auth.
 */
export function scheduleAuthNavigation(replace: (href: string) => void, href: string): void {
  const hrefCandidates = href === '/home' ? ['/home', '/(tabs)/home'] : [href];
  // #region agent log
  fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'dba73f' },
    body: JSON.stringify({
      sessionId: 'dba73f',
      runId: 'pre-fix',
      hypothesisId: 'H4',
      location: 'lib/schedule-navigation.ts:entry',
      message: 'scheduleAuthNavigation invoked',
      data: { href, hrefCandidates, platform: Platform.OS },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const run = () => {
    try {
      router.dismissAll();
    } catch (e) {
      console.warn('[scheduleAuthNavigation] dismissAll skipped:', e);
    }

    const tryCandidate = (index: number) => {
      const target = hrefCandidates[index];
      if (!target) return;
      // #region agent log
      fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'dba73f' },
        body: JSON.stringify({
          sessionId: 'dba73f',
          runId: 'pre-fix',
          hypothesisId: 'H5',
          location: 'lib/schedule-navigation.ts:tryCandidate',
          message: 'Attempting auth replace target',
          data: { index, target, candidatesCount: hrefCandidates.length },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      // #region agent log
      agentLog('H2', 'schedule-navigation.ts:run', 'auth_replace_invoked', {
        href: target,
        platform: Platform.OS,
      });
      // #endregion
      try {
        replace(target);
      } catch (e) {
        if (index + 1 < hrefCandidates.length) {
          tryCandidate(index + 1);
          return;
        }
        console.error('[scheduleAuthNavigation] replace failed, retrying:', e);
        try {
          replace(target);
        } catch (e2) {
          console.error('[scheduleAuthNavigation] retry failed:', e2);
        }
      }
    };

    tryCandidate(0);
  };

  if (Platform.OS === 'web') {
    queueMicrotask(() => requestAnimationFrame(run));
    return;
  }

  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Extra delay so the root stack + tabs finish mounting before replace (reduces 404 flashes).
        setTimeout(run, 100);
      });
    });
  });
}
