/** One operator label across customer, service, and subscription evidence. */
export function customerLabel(
  account: { account_id?: string; name?: string; metadata?: Record<string, unknown> },
  unnamedLabel: string
): string {
  const candidates = [account.metadata?.operator_display_name, account.name];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const name = candidate.trim();
    if (!name || name === account.account_id || /^acct[_-]/i.test(name)) continue;
    if (/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(name)) continue;
    if (/Fatal error|Stack trace|Command line code|Uncaught ValueError|Path must not be empty/i.test(name)) continue;
    return name;
  }
  return unnamedLabel;
}
