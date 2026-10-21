/**
 * Join inline summary fragments with " · " without doubling punctuation:
 * trailing sentence marks (。．.！!？?；;，,) are dropped from each fragment first.
 */
export function joinSummaryParts(parts: Array<string | null | undefined | false>): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim().replace(/[。．.！!？?；;，,]+$/u, '') : ''))
    .filter(Boolean)
    .join(' · ');
}
