/**
 * @deprecated The native app uses Expo Router screens, not a full-app WebView.
 * Kept only for reference or temporary debugging — not mounted from `app/_layout.tsx`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Production PWA URL — full HTTPS, no localhost. */
export const LIVE_SITE_URL = 'https://xpass-rork-1e6ad.web.app/';

function isExternalScheme(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.startsWith('mailto:') ||
    u.startsWith('tel:') ||
    u.startsWith('sms:') ||
    u.startsWith('intent:') ||
    u.startsWith('geo:') ||
    u.startsWith('whatsapp:')
  );
}

export default function MobileWebApp() {
  const insets = useSafeAreaInsets();
  const [epoch, setEpoch] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const splashHidden = useRef(false);

  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      hideSplash();
    }, 12000);
    return () => clearTimeout(t);
  }, [hideSplash]);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setEpoch((e) => e + 1);
  }, []);

  const onLoadStart = () => {
    setLoading(true);
    setError(null);
  };

  const onLoadEnd = () => {
    setLoading(false);
    hideSplash();
  };

  const onError = (e: WebViewErrorEvent) => {
    const desc = e.nativeEvent.description || 'Failed to load page';
    console.error('[MobileWebApp] WebView error:', desc, e.nativeEvent);
    setError(desc);
    setLoading(false);
    hideSplash();
  };

  const onHttpError = (e: WebViewHttpErrorEvent) => {
    const code = e.nativeEvent.statusCode;
    if (code >= 400) {
      const msg = `Server error (${code})`;
      console.error('[MobileWebApp] HTTP error:', code, e.nativeEvent.url);
      setError(msg);
      setLoading(false);
      hideSplash();
    }
  };

  const onShouldStartLoadWithRequest = (request: { url: string; isTopFrame?: boolean }) => {
    const url = request.url;
    if (!url) return true;

    if (isExternalScheme(url)) {
      Linking.openURL(url).catch((err) => {
        console.warn('[MobileWebApp] Could not open URL:', url, err);
      });
      return false;
    }

    return true;
  };

  if (error) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.fallbackTitle}>Unable to load</Text>
        <Text style={styles.fallbackMessage}>{error}</Text>
        <Text style={styles.fallbackHint}>Check your connection and try again.</Text>
        <TouchableOpacity style={styles.button} onPress={handleRetry} accessibilityRole="button">
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        key={epoch}
        source={{ uri: LIVE_SITE_URL }}
        style={styles.webview}
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onError={onError}
        onHttpError={onHttpError}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        javaScriptEnabled
        domStorageEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        androidLayerType="hardware"
        startInLoadingState={false}
        {...(Platform.OS === 'android'
          ? {
              onRenderProcessGone: () => {
                console.warn('[MobileWebApp] Android render process gone; reload');
                handleRetry();
              },
            }
          : {})}
      />
      {loading ? (
        <View style={[styles.overlay, { paddingTop: insets.top }]} pointerEvents="none">
          <ActivityIndicator size="large" color="#023c69" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#333',
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  fallbackMessage: {
    fontSize: 15,
    color: '#444',
    textAlign: 'center',
    marginBottom: 8,
  },
  fallbackHint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#023c69',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
