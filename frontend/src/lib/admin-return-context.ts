const ADMIN_RETURN_CONTEXT_ORIGIN = 'https://admin-return-context.invalid';

export const ADMIN_RETURN_TO_PARAM = 'return_to';
export const ADMIN_RETURN_TO_MAX_LENGTH = 2048;

export const ADMIN_QUEUE_PATHNAMES = {
  accounts: '/admin/accounts',
  subscriptions: '/admin/subscriptions',
  supportRequests: '/admin/support-requests',
} as const;

export type AdminQueuePathname =
  (typeof ADMIN_QUEUE_PATHNAMES)[keyof typeof ADMIN_QUEUE_PATHNAMES];

declare const adminAccountDetailPathnameBrand: unique symbol;
export type AdminAccountDetailPathname = `/admin/accounts/${string}` & {
  readonly [adminAccountDetailPathnameBrand]: true;
};

export const ADMIN_ACCOUNT_ID_MAX_LENGTH = 256;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MALFORMED_PERCENT_ESCAPE_PATTERN = /%(?![0-9a-f]{2})/i;
const ENCODED_UNSAFE_CHARACTER_PATTERN = /%(?:0[0-9a-f]|1[0-9a-f]|5c|7f)/i;
const DOUBLE_ENCODED_UNSAFE_CHARACTER_PATTERN = /%25(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/i;

export type AdminReturnContextPolicy = Readonly<{
  allowedPathnames: readonly AdminQueuePathname[];
  fallback: AdminQueuePathname;
}>;

export type AdminAccountSiteReturnContextPolicy = Readonly<{
  parentPathname: AdminAccountDetailPathname;
  fallback: typeof ADMIN_QUEUE_PATHNAMES.accounts;
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

function hasReturnTo(searchParams: URLSearchParams): boolean {
  return searchParams.has(ADMIN_RETURN_TO_PARAM);
}

function parseSafeReturnContext(value: string): URL | null {
  if (
    value.length === 0 ||
    value.length > ADMIN_RETURN_TO_MAX_LENGTH ||
    value !== value.trim() ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    hasUnsafeTransportCharacters(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(value, ADMIN_RETURN_CONTEXT_ORIGIN);
    if (
      parsed.origin !== ADMIN_RETURN_CONTEXT_ORIGIN ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function assertAccountDetailPathname(
  pathname: AdminAccountDetailPathname
): void {
  const prefix = `${ADMIN_QUEUE_PATHNAMES.accounts}/`;
  if (!pathname.startsWith(prefix)) {
    throw new TypeError('Admin account detail pathname must use the accounts route.');
  }
  const encodedAccountId = pathname.slice(prefix.length);
  if (!encodedAccountId || encodedAccountId.includes('/')) {
    throw new TypeError('Admin account detail pathname must contain one account segment.');
  }
  let accountId: string;
  try {
    accountId = decodeURIComponent(encodedAccountId);
  } catch {
    throw new TypeError('Admin account detail pathname must contain a valid account segment.');
  }
  if (buildAdminAccountDetailPathname(accountId) !== pathname) {
    throw new TypeError('Admin account detail pathname must be canonical.');
  }
}

function assertAdminDetailPathname(pathname: `/admin/${string}`): void {
  if (
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    pathname.includes('?') ||
    pathname.includes('#') ||
    hasUnsafeTransportCharacters(pathname)
  ) {
    throw new TypeError('Admin detail pathname must be a safe in-app pathname.');
  }

  const parsed = new URL(pathname, ADMIN_RETURN_CONTEXT_ORIGIN);
  if (
    parsed.origin !== ADMIN_RETURN_CONTEXT_ORIGIN ||
    parsed.pathname !== pathname
  ) {
    throw new TypeError('Admin detail pathname must not require URL normalization.');
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
  if (typeof value !== 'string') {
    return policy.fallback;
  }

  const parsed = parseSafeReturnContext(value);
  if (!parsed || hasReturnTo(parsed.searchParams)) {
    return policy.fallback;
  }

  try {
    const pathnameEnd = value.search(/[?#]/);
    const rawPathname = pathnameEnd === -1 ? value : value.slice(0, pathnameEnd);
    if (
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

export function buildAdminAccountDetailPathname(
  accountId: string
): AdminAccountDetailPathname {
  if (
    typeof accountId !== 'string' ||
    accountId.length === 0 ||
    accountId.length > ADMIN_ACCOUNT_ID_MAX_LENGTH ||
    accountId !== accountId.trim() ||
    accountId === '.' ||
    accountId === '..' ||
    /[\/\\?#]/.test(accountId) ||
    CONTROL_CHARACTER_PATTERN.test(accountId)
  ) {
    throw new TypeError('Admin account ID must be one safe path segment.');
  }

  const encodedAccountId = encodeURIComponent(accountId);
  const pathname = `${ADMIN_QUEUE_PATHNAMES.accounts}/${encodedAccountId}`;
  const parsed = new URL(pathname, ADMIN_RETURN_CONTEXT_ORIGIN);
  if (parsed.pathname !== pathname) {
    throw new TypeError('Admin account detail pathname must not require URL normalization.');
  }
  return pathname as AdminAccountDetailPathname;
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
  assertAdminDetailPathname(input.detailPathname);

  const params = new URLSearchParams({
    [ADMIN_RETURN_TO_PARAM]: normalizeAdminReturnTo(
      input.returnTo,
      input.policy
    ),
  });
  return `${input.detailPathname}?${params.toString()}`;
}

export function buildAdminAccountSiteReturnTo(input: {
  parentPathname: AdminAccountDetailPathname;
  searchParams: string | URLSearchParams;
  accountsPolicy: AdminReturnContextPolicy;
}): string {
  assertAccountDetailPathname(input.parentPathname);
  if (
    input.accountsPolicy.allowedPathnames.length !== 1 ||
    input.accountsPolicy.allowedPathnames[0] !== ADMIN_QUEUE_PATHNAMES.accounts ||
    input.accountsPolicy.fallback !== ADMIN_QUEUE_PATHNAMES.accounts
  ) {
    throw new TypeError('Admin account-site context requires the Accounts queue policy.');
  }

  const params = new URLSearchParams(input.searchParams);
  const innerValues = params.getAll(ADMIN_RETURN_TO_PARAM);
  const inner = innerValues.length === 1
    ? normalizeAdminReturnTo(innerValues[0], input.accountsPolicy)
    : input.accountsPolicy.fallback;
  params.delete(ADMIN_RETURN_TO_PARAM);
  params.append(ADMIN_RETURN_TO_PARAM, inner);
  const query = params.toString();
  const candidate = `${input.parentPathname}${query ? `?${query}` : ''}`;
  return candidate.length <= ADMIN_RETURN_TO_MAX_LENGTH
    ? candidate
    : input.accountsPolicy.fallback;
}

export function normalizeAdminAccountSiteReturnTo(
  value: string | null | undefined,
  policy: AdminAccountSiteReturnContextPolicy
): string {
  assertAccountDetailPathname(policy.parentPathname);
  if (policy.fallback !== ADMIN_QUEUE_PATHNAMES.accounts) {
    throw new TypeError('Admin account-site fallback must be the Accounts queue.');
  }
  if (typeof value !== 'string') return policy.fallback;

  const parsed = parseSafeReturnContext(value);
  if (!parsed) return policy.fallback;
  const pathnameEnd = value.search(/[?#]/);
  const rawPathname = pathnameEnd === -1 ? value : value.slice(0, pathnameEnd);
  if (parsed.pathname !== rawPathname) return policy.fallback;
  if (parsed.pathname === policy.fallback) {
    return policy.fallback;
  }
  if (parsed.pathname !== policy.parentPathname) return policy.fallback;

  const innerValues = parsed.searchParams.getAll(ADMIN_RETURN_TO_PARAM);
  if (innerValues.length > 1) return policy.fallback;
  const params = new URLSearchParams(parsed.searchParams);
  params.delete(ADMIN_RETURN_TO_PARAM);
  if (innerValues.length === 1) {
    const accountsPolicy = {
      allowedPathnames: [ADMIN_QUEUE_PATHNAMES.accounts],
      fallback: ADMIN_QUEUE_PATHNAMES.accounts,
    } as const;
    const normalizedInner = normalizeAdminReturnTo(innerValues[0], accountsPolicy);
    if (normalizedInner !== innerValues[0]) return policy.fallback;
    params.append(ADMIN_RETURN_TO_PARAM, normalizedInner);
  }
  const query = params.toString();
  const normalized = `${policy.parentPathname}${query ? `?${query}` : ''}`;
  return normalized.length <= ADMIN_RETURN_TO_MAX_LENGTH
    ? normalized
    : policy.fallback;
}

export function buildAdminNestedDetailHref(input: {
  detailPathname: `/admin/${string}`;
  returnTo: string;
  policy: AdminAccountSiteReturnContextPolicy;
}): string {
  assertAdminDetailPathname(input.detailPathname);
  const normalizedReturnTo = normalizeAdminAccountSiteReturnTo(
    input.returnTo,
    input.policy
  );
  const href = `${input.detailPathname}?${new URLSearchParams({
    [ADMIN_RETURN_TO_PARAM]: normalizedReturnTo,
  }).toString()}`;
  if (href.length <= ADMIN_RETURN_TO_MAX_LENGTH) return href;
  const fallbackHref = `${input.detailPathname}?${new URLSearchParams({
    [ADMIN_RETURN_TO_PARAM]: input.policy.fallback,
  }).toString()}`;
  if (fallbackHref.length > ADMIN_RETURN_TO_MAX_LENGTH) {
    throw new TypeError('Admin nested detail href exceeds the return context limit.');
  }
  return fallbackHref;
}
