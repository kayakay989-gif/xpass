/**
 * Extracts a user-visible message from tRPC / fetch errors (including "HTTP 500: {...}" wrappers).
 */
function extractUnderlyingMessage(error: unknown): string {
  if (error == null) return 'Check-in failed. Please try again.';
  if (typeof error === 'string') return unwrapTrpcHttpPayload(error);

  const e = error as Record<string, unknown>;
  const data = e.data as Record<string, unknown> | undefined;
  const json = data?.json as Record<string, unknown> | undefined;
  if (typeof json?.message === 'string') return json.message;
  if (typeof data?.message === 'string') return data.message as string;
  if (typeof e.message === 'string') return unwrapTrpcHttpPayload(e.message);

  return 'Check-in failed. Please try again.';
}

function unwrapTrpcHttpPayload(message: string): string {
  const trimmed = message.trim();
  const jsonStart = trimmed.search(/\{"error"\s*:/);
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: { json?: { message?: string }; message?: string };
      };
      const inner = parsed?.error?.json?.message ?? parsed?.error?.message;
      if (typeof inner === 'string' && inner.length > 0) return inner;
    } catch {
      // ignore
    }
  }
  return trimmed;
}

const DAILY_LIMIT_RE = /daily\s*limit|check\s*in\s*daily|one\s*gym\s*check-?in\s*per\s*calendar\s*day|resets?\s*on\s*the\s*next\s*calendar\s*day/i;

/**
 * Short, friendly copy for check-in failures (tRPC or pre-formatted strings from AppContext).
 */
export function getCheckInUserMessage(error: unknown): string {
  const raw = extractUnderlyingMessage(error);
  if (DAILY_LIMIT_RE.test(raw)) {
    return 'You have checked in once today. Check back tomorrow.';
  }
  if (raw.length > 280 && (raw.includes('HTTP') || raw.includes('"json"'))) {
    return 'Check-in could not be completed. Please try again.';
  }
  return raw;
}
