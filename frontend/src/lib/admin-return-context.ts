const ADMIN_RETURN_CONTEXT_ORIGIN = 'https://admin-return-context.invalid';

export const ADMIN_RETURN_TO_PARAM = 'return_to';
export const ADMIN_RETURN_TO_MAX_LENGTH = 2048;

export const ADMIN_QUEUE_PATHNAMES = {
  subscriptions: '/admin/subscriptions',
  supportRequests: '/admin/support-requests',
} as const;

export type AdminQueuePathname =
  (typeof ADMIN_QUEUE_PATHNAMES)[keyof typeof ADMIN_QUEUE_PATHNAMES];

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MALFORMED_PERCENT_ESCAPE_PATTERN = /%(?![0-9a-f]{2})/i;
const ENCODED_UNSAFE_CHARACTER_PATTERN = /%(?:0[0-9a-f]|1[0-9a-f]|5c|7f)/i;
const DOUBLE_ENCODED_UNSAFE_CHARACTER_PATTERN = /%25(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/i;

export type AdminReturnContextPolicy = Readonly<{
  allowedPathnames: readonly AdminQueuePathname[];
  fallback: AdminQueuePathname;
}>;

function hasUnsafeTransportCharacters(value: string): boolean {
  return (
    CONTROL_CHARACTER_PATTERN.test(value) ||
    value.includes('\\') ||
    MALFORMED_PERCENT_ESCAPE_PATTERN.test(value) ||
    ENCODED_UNSAFE_CHARACTER_PATTERN.test(value) ||
    DOUBLE_ENCODED_UNSAFE_CHARACTER_PATTERN.test(value)
  );
}

function assertReturnContextPolicy(policy: AdminReturnContextPolicy): void {
  if (!policy.allowedPathnames.includes(policy.fallback)) {
    throw new TypeError('Admin return context fallback must be allowed.');
  }
}

/**
 * Normalize an untrusted return_to value to one caller-declared Admin queue.
 * The context deliberately owns only an in-app pathname and query string.
 */
export function normalizeAdminReturnTo(
  value: string | null | undefined,
  policy: AdminReturnContextPolicy
): string {
  assertReturnContextPolicy(policy);
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ADMIN_RETURN_TO_MAX_LENGTH ||
    value !== value.trim() ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    hasUnsafeTransportCharacters(value)
  ) {
    return policy.fallback;
  }

  try {
    const pathnameEnd = value.search(/[?#]/);
    const rawPathname = pathnameEnd === -1 ? value : value.slice(0, pathnameEnd);
    const parsed = new URL(value, ADMIN_RETURN_CONTEXT_ORIGIN);
    if (
      parsed.origin !== ADMIN_RETURN_CONTEXT_ORIGIN ||
      parsed.username ||
      parsed.password ||
      !policy.allowedPathnames.includes(rawPathname as AdminQueuePathname) ||
      !policy.allowedPathnames.includes(parsed.pathname as AdminQueuePathname) ||
      parsed.pathname !== rawPathname ||
      parsed.hash
    ) {
      return policy.fallback;
    }
    const normalized = `${parsed.pathname}${parsed.search}`;
    return normalized.length <= ADMIN_RETURN_TO_MAX_LENGTH
      ? normalized
      : policy.fallback;
  } catch {
    return policy.fallback;
  }
}

export function buildAdminQueueReturnTo(input: {
  pathname: string;
  searchParams: string | URLSearchParams;
  policy: AdminReturnContextPolicy;
  focusId?: string;
}): string {
  const params = new URLSearchParams(input.searchParams);
  params.delete(ADMIN_RETURN_TO_PARAM);
  if (input.focusId) params.set('focus', input.focusId);
  const query = params.toString();
  const candidate = `${input.pathname}${query ? `?${query}` : ''}`;
  return normalizeAdminReturnTo(candidate, input.policy);
}

export function buildAdminDetailHref(input: {
  detailPathname: `/admin/${string}`;
  returnTo: string;
  policy: AdminReturnContextPolicy;
}): string {
  if (
    !input.detailPathname.startsWith('/') ||
    input.detailPathname.startsWith('//') ||
    input.detailPathname.includes('?') ||
    input.detailPathname.includes('#') ||
    hasUnsafeTransportCharacters(input.detailPathname)
  ) {
    throw new TypeError('Admin detail pathname must be a safe in-app pathname.');
  }

  const parsedDetail = new URL(input.detailPathname, ADMIN_RETURN_CONTEXT_ORIGIN);
  if (
    parsedDetail.origin !== ADMIN_RETURN_CONTEXT_ORIGIN ||
    parsedDetail.pathname !== input.detailPathname
  ) {
    throw new TypeError('Admin detail pathname must not require URL normalization.');
  }

  const params = new URLSearchParams({
    [ADMIN_RETURN_TO_PARAM]: normalizeAdminReturnTo(
      input.returnTo,
      input.policy
    ),
  });
  return `${input.detailPathname}?${params.toString()}`;
}
