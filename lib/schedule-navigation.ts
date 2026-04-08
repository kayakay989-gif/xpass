import { InteractionManager, Platform } from 'react-native';

/**
 * Defers `router.replace` until after interactions + paint to avoid Expo Router briefly
 * matching no route (404 flash) right after auth.
 */
export function scheduleAuthNavigation(replace: (href: string) => void, href: string): void {
  const run = () => {
    try {
      replace(href);
    } catch (e) {
      console.error('[scheduleAuthNavigation] replace failed, retrying:', e);
      setTimeout(() => {
        try {
          replace(href);
        } catch (e2) {
          console.error('[scheduleAuthNavigation] retry failed:', e2);
        }
      }, 120);
    }
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
