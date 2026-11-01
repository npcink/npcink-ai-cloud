import { expect, it } from 'vitest';
import { buildForm, formItem, readConfirmation, readIntent, requireCatalog, requireWrite } from '@/features/admin/credit-packs/catalog-projection';
import { packCatalog, packConfirmation, packIntent, packItems, packWrite } from '../fixtures/admin-credit-packs';

it('accepts defaults, legal empty, exact six-decimal amounts and integer boundaries without coercion', () => {
  expect(requireCatalog(packCatalog()).items).toEqual(packItems());
  expect(requireCatalog(packCatalog([])).items).toEqual([]);
  for (const value of ['0.000001', '0.123456', '29.9', '99']) expect(formItem({ ...buildForm(packItems()[0]), amount: value }).amount).toBe(Number(value));
  expect(formItem({ ...buildForm(packItems()[0]), ai_credits: '10000000', validity_days: '1095' }).ai_credits).toBe(10000000);
});
it.each(['', '0', '-1', 'NaN', 'Infinity', '0.0000001', '0.1234567'])('rejects invalid/round-to-zero form amount %s', amount => {
  expect(() => formItem({ ...buildForm(packItems()[0]), amount })).toThrow();
});
it.each([{}, { ...packCatalog(), items: null }, { ...packCatalog(), items: {} }, { ...packCatalog(), items: [null] },
  { ...packCatalog(), revision: '' }, { ...packCatalog(), items: [packItems()[0], packItems()[0]] },
  ...['pack_id', 'label', 'amount', 'currency', 'ai_credits', 'validity_days', 'recommended_for_tiers', 'active'].map(key => ({ ...packCatalog(), items: [{ ...packItems()[0], [key]: null }] })),
])('rejects damaged initial and saved catalog %#', value => { expect(() => requireCatalog(value)).toThrow(); });
it.each([{ ai_credits: '1.5' }, { ai_credits: '10000001' }, { validity_days: '1096' }, { validity_days: '0' }, { label: ' ' }])('rejects illegal editable fields %#', patch => {
  expect(() => formItem({ ...buildForm(packItems()[0]), ...patch })).toThrow();
});
it('requires original complete catalog/target/revision and exact stored form before dispatch', () => {
  const intent = packIntent();
  expect(readIntent(intent)).toEqual(intent);
  expect(() => readIntent({ ...intent, target: 'pack_other' })).toThrow();
  expect(() => readIntent({ ...intent, form: { ...intent.form, amount: '1' } })).toThrow();
  expect(() => requireWrite(packWrite(intent), intent)).not.toThrow();
  for (const value of [{ revision: 'b'.repeat(32) }, { ...packWrite(intent), items: [] },
    { ...packWrite(intent), items: [...intent.items.slice(0, 1), { ...intent.items[1], amount: 1 }, intent.items[2]] },
    { ...packWrite(intent), catalog_operation: {} }, { ...packWrite(intent), revision: intent.expected_revision }]) expect(() => requireWrite(value, intent)).toThrow();
});
it('current values alone cannot prove an operation, every receipt binding is required', () => {
  const intent = packIntent(), evidence = packConfirmation(intent);
  expect(readConfirmation(evidence, intent)?.audit_event_id).toBe(42);
  expect(readConfirmation(packConfirmation(intent, false), intent)).toBeNull();
  for (const key of ['operation_id', 'expected_revision', 'setting_id', 'scope_kind', 'scope_id', 'revision', 'items', 'actor_kind', 'actor_ref', 'method', 'path', 'event_kind', 'outcome', 'audit_event_id']) {
    expect(() => readConfirmation({ ...evidence, receipt: { ...evidence.receipt, [key]: null } }, intent), key).toThrow();
  }
  expect(() => readConfirmation({ ...evidence, current: packCatalog() }, intent)).toThrow();
});

it('keeps legal empty recommendations readable but rejects an empty edit before dispatch', () => {
  const items = packItems(); items[0].recommended_for_tiers = [];
  expect(requireCatalog(packCatalog(items)).items[0].recommended_for_tiers).toEqual([]);
  expect(() => formItem(buildForm(items[0]))).toThrow();
  expect(formItem({ ...buildForm(items[0]), recommended_for_tiers: ['plus'] }).recommended_for_tiers).toEqual(['plus']);
});
