/** User-visible gym owner login error messages. */
export function getGymLoginUserMessage(error: unknown): string {
  if (error == null) {
    return 'Login failed. Please try again.';
  }

  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: string }).name)
      : '';
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: string }).message)
      : typeof error === 'string'
        ? error
        : '';

  const combined = `${name} ${message}`.toLowerCase();
  if (combined.includes('abort') || combined.includes('aborted')) {
    return 'Connection timed out while waking up the server. Please wait a moment and tap Login again.';
  }

  if (message.trim()) {
    const lower = message.trim().toLowerCase();
    if (lower.includes('invalid username or password')) {
      return (
        'Invalid username or password. Use the exact password from admin ' +
        '(format: gym_ followed by the first 8 characters of your gym ID — ' +
        'not the short code at the end of your username).'
      );
    }
    return message.trim();
  }

  return 'Login failed. Please try again.';
}
