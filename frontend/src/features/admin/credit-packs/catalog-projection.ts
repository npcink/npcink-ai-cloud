import { isValidIdempotencyKey } from '@/lib/idempotency';

export const MANAGED_TIERS = ['free', 'plus', 'pro', 'agency'] as const;
const PACK_IDS = ['pack_small', 'pack_medium', 'pack_large'];
export const SETTING_ID = 'commercial_credit_pack_catalog';
export type CreditPackItem = {
  pack_id: string; label: string; ai_credits: number; amount: number; currency: string;
  recommended_for_tiers: string[]; validity_days: number; active: boolean;
};
export type CreditPackCatalogPayload = {
  setting_id: string; revision: string; catalog_version: string; period_policy: string;
  expiry_policy: string; default_validity_days: number; grant_event_type: string;
  configured: boolean; items: CreditPackItem[]; updated_at: string | null;
};
export type PackForm = Omit<CreditPackItem, 'ai_credits' | 'amount' | 'validity_days'> & {
  ai_credits: string; amount: string; validity_days: string;
};
export type PackIntent = {
  operation_id: string; expected_revision: string; target: string;
  items: CreditPackItem[]; form: PackForm;
};
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
const positiveInt = (v: unknown, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= max;
const amount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 && Number(v.toFixed(6)) === v;
export const validRevision = (v: unknown): v is string => text(v) && v.trim() === v && v.length <= 128;
export function requireItems(value: unknown): CreditPackItem[] {
  if (!Array.isArray(value)) throw new Error('Invalid credit pack items');
  const ids = new Set<string>();
  for (const item of value) {
    if (!record(item) || !text(item.pack_id) || !PACK_IDS.includes(item.pack_id) || ids.has(item.pack_id)
      || !text(item.label) || item.label.length > 96 || item.currency !== 'CNY'
      || !positiveInt(item.ai_credits, 10_000_000) || !positiveInt(item.validity_days, 1095) || !amount(item.amount)
      || typeof item.active !== 'boolean' || !Array.isArray(item.recommended_for_tiers)
      || !item.recommended_for_tiers.every(tier => typeof tier === 'string' && MANAGED_TIERS.includes(tier as typeof MANAGED_TIERS[number]))
      || new Set(item.recommended_for_tiers).size !== item.recommended_for_tiers.length) throw new Error('Invalid credit pack item');
    ids.add(item.pack_id);
  }
  // Select only editable fields; never silently repair or coerce a broken row.
  return value.map(item => ({ pack_id: item.pack_id, label: item.label, ai_credits: item.ai_credits,
    amount: item.amount, currency: item.currency, recommended_for_tiers: [...item.recommended_for_tiers],
    validity_days: item.validity_days, active: item.active }));
}
export function requireCatalog(value: unknown): CreditPackCatalogPayload {
  if (!record(value) || value.setting_id !== SETTING_ID || !validRevision(value.revision)
    || value.catalog_version !== 'ai-credit-packs-v1' || value.period_policy !== 'paid_credit_validity_days'
    || value.expiry_policy !== 'paid_at_plus_validity_days' || value.grant_event_type !== 'grant'
    || !positiveInt(value.default_validity_days, 1095) || typeof value.configured !== 'boolean'
    || !(value.updated_at === null || (text(value.updated_at) && Number.isFinite(Date.parse(value.updated_at))))) throw new Error('Invalid credit pack catalog');
  return { ...value, items: requireItems(value.items) } as CreditPackCatalogPayload;
}
export const buildForm = (item: CreditPackItem): PackForm => ({ ...item, recommended_for_tiers: [...item.recommended_for_tiers],
  ai_credits: String(item.ai_credits), amount: String(item.amount), validity_days: String(item.validity_days) });
export function formItem(form: PackForm): CreditPackItem {
  // The existing server restores defaults for an empty recommendation. Reject
  // that edit before persistence/dispatch; reads can still contain a legal [].
  if (!Array.isArray(form.recommended_for_tiers) || !form.recommended_for_tiers.length) throw new Error('Select at least one recommended tier');
  for (const key of ['ai_credits', 'amount', 'validity_days'] as const) {
    if (typeof form[key] !== 'string' || !form[key].trim()) throw new Error('Required numeric field');
  }
  return requireItems([{ ...form, label: form.label.trim(), ai_credits: Number(form.ai_credits),
    amount: Number(form.amount), validity_days: Number(form.validity_days) }])[0];
}
export function sameItems(value: unknown, expected: CreditPackItem[]): boolean {
  const canonical = (items: CreditPackItem[]) => JSON.stringify(requireItems(items).sort((a, b) => a.pack_id.localeCompare(b.pack_id)));
  try { return canonical(requireItems(value)) === canonical(expected); } catch { return false; }
}
export function readIntent(value: unknown): PackIntent {
  if (!record(value) || !text(value.operation_id) || !isValidIdempotencyKey(value.operation_id)
    || !validRevision(value.expected_revision) || !text(value.target) || !record(value.form)) throw new Error('Invalid pending credit pack operation');
  const items = requireItems(value.items), form = value.form as PackForm;
  const target = formItem(form);
  if (target.pack_id !== value.target || !sameItems(items.filter(item => item.pack_id === value.target), [target])) throw new Error('Wrong pending pack target');
  return { operation_id: value.operation_id, expected_revision: value.expected_revision, target: value.target, items, form };
}
export function requireWrite(value: unknown, intent: PackIntent): CreditPackCatalogPayload {
  const catalog = requireCatalog(value);
  if (catalog.revision === intent.expected_revision || !sameItems(catalog.items, intent.items)
    || !record(value) || !record(value.catalog_operation) || value.catalog_operation.expected_revision !== intent.expected_revision
    || !sameItems(value.catalog_operation.items, intent.items)) throw new Error('Invalid credit pack write evidence');
  return catalog;
}
export function readConfirmation(value: unknown, intent: PackIntent): { catalog: CreditPackCatalogPayload; audit_event_id: number } | null {
  if (!record(value) || value.setting_id !== SETTING_ID || value.operation_id !== intent.operation_id
    || value.expected_revision !== intent.expected_revision) throw new Error('Wrong credit pack operation');
  if (value.state === 'unconfirmed' && value.current === null && value.receipt === null) return null;
  const receipt = value.receipt, catalog = requireWrite(value.current, intent);
  if (value.state !== 'confirmed' || !record(receipt) || receipt.operation_id !== intent.operation_id
    || receipt.setting_id !== SETTING_ID || receipt.scope_id !== SETTING_ID || receipt.scope_kind !== 'service_setting'
    || receipt.expected_revision !== intent.expected_revision || receipt.revision !== catalog.revision
    || !sameItems(receipt.items, intent.items) || receipt.method !== 'PATCH' || receipt.path !== '/internal/service/admin/credit-packs'
    || receipt.event_kind !== 'payment.credit_pack_catalog.update' || receipt.outcome !== 'succeeded'
    || !text(receipt.actor_kind) || !text(receipt.actor_ref) || !positiveInt(receipt.audit_event_id, Number.MAX_SAFE_INTEGER)) throw new Error('Invalid durable credit pack receipt');
  return { catalog, audit_event_id: Number(receipt.audit_event_id) };
}
