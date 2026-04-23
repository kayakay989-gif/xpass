/** Debug-mode NDJSON ingest (session 9fa711). No PII/secrets. */
export function agentLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {}
): void {
  const payload = {
    sessionId: '9fa711',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  // Mirror for Metro / Logcat when ingest host is unreachable (e.g. physical device).
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    try {
      console.log('[agent-9fa711]', JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
  // #region agent log
  fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '9fa711',
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}
