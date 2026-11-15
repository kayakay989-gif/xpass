/** Keep user-entered text from being evaluated as a spreadsheet formula. */
export function excelText(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  if (text.length === 0) return '';
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`;
  return text;
}

export function excelDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
