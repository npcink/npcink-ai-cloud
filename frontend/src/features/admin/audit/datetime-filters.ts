export function localDateTimeValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 23);
}

// Compare the displayed wall-clock components, not parsed instants: browser
// normalization can omit zero seconds or trailing fractional zeros. Keeping
// this comparison local also avoids treating a DST-normalized edit as unchanged.
function localDateTimeKey(value: string): string | null {
  const parts = /^(\d{4,}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  return parts ? `${parts[1]}:${parts[2] || '00'}.${(parts[3] || '').padEnd(3, '0')}` : null;
}

export function serializeDateTimeFilter(value: string, existingValue: string | null): string {
  const displayed = localDateTimeValue(existingValue);
  if (existingValue && displayed && localDateTimeKey(value) === displayed) return existingValue;
  return new Date(value).toISOString();
}
