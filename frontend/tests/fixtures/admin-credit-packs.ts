import { buildForm, SETTING_ID, type CreditPackItem, type PackIntent } from '@/features/admin/credit-packs/catalog-projection';
export const revision = (char = 'a') => char.repeat(32);
export const packItems = (): CreditPackItem[] => ['small', 'medium', 'large'].map((size, index) => ({
  pack_id: `pack_${size}`, label: `${size} credit pack`, ai_credits: [10000, 35000, 150000][index],
  amount: [99, 349, 1499][index], currency: 'CNY', recommended_for_tiers: ['free', 'plus'], validity_days: 365, active: true,
}));
export const packCatalog = (items = packItems(), rev = revision()) => ({ setting_id: SETTING_ID,
  revision: rev, catalog_version: 'ai-credit-packs-v1', period_policy: 'paid_credit_validity_days',
  expiry_policy: 'paid_at_plus_validity_days', grant_event_type: 'grant', default_validity_days: 365,
  configured: true, updated_at: '2026-11-02T00:00:00Z', items,
});
export const packIntent = (): PackIntent => ({ operation_id: 'original-pack-key', expected_revision: revision(),
  target: 'pack_small', items: packItems(), form: buildForm(packItems()[0]) });
export const packWrite = (intent: PackIntent) => ({ ...packCatalog(intent.items, revision('b')),
  catalog_operation: { expected_revision: intent.expected_revision, items: intent.items },
});
export const packConfirmation = (intent: PackIntent, confirmed = true) => ({ setting_id: SETTING_ID,
  operation_id: intent.operation_id, expected_revision: intent.expected_revision, state: confirmed ? 'confirmed' : 'unconfirmed',
  current: confirmed ? packWrite(intent) : null,
  receipt: confirmed ? { operation_id: intent.operation_id, expected_revision: intent.expected_revision,
    setting_id: SETTING_ID, scope_kind: 'service_setting', scope_id: SETTING_ID,
    revision: revision('b'), items: intent.items, actor_kind: 'internal', actor_ref: 'platform:internal_root',
    method: 'PATCH', path: '/internal/service/admin/credit-packs', event_kind: 'payment.credit_pack_catalog.update',
    outcome: 'succeeded', audit_event_id: 42 } : null,
});
