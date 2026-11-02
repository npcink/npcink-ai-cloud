// Match Python str.strip/split, including its four control separators and NEL.
// ECMAScript trim/\s also removes BOM, which Python deliberately preserves.
const whitespace = '[\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const edges = new RegExp(`^${whitespace}+|${whitespace}+$`, 'g');
const runs = new RegExp(`${whitespace}+`, 'g');
export const stripSupportWhitespace = (value: string) => value.replace(edges, '');
const limit = (value: string, size: number) => Array.from(value).slice(0, size).join('');
export const normalizeSupportMessage = stripSupportWhitespace;
export const hasSupportMessage = (value: string) => {
  const size = Array.from(normalizeSupportMessage(value)).length;
  return size >= 2 && size <= 4000;
};
export const normalizeSupportNote = stripSupportWhitespace;
export function normalizeSupportFilename(value: string) {
  const basename = stripSupportWhitespace(value).replaceAll('\\', '/').split('/').at(-1)!;
  // The API receives at most 191 codepoints. Trim an edge exposed by clipping
  // so the submitted filename is unchanged by the server's subsequent split.
  return stripSupportWhitespace(limit(stripSupportWhitespace(basename).replace(runs, ' '), 191));
}
export const normalizeSupportContentType = (value: string) => stripSupportWhitespace(value).toLowerCase().split(';')[0];
