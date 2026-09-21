import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n';

// Keys retired by the 2026-09-21 cleanup wave: they existed only in the `en`
// catalog, had no `t('...')` reference anywhere in `frontend/src` or
// `frontend/tests`, and belong to no dynamically constructed key family.
// This test pins their retirement so they are not silently reintroduced.
const retiredKeys = [
  'admin.back_to_providers',
  'admin.base_url',
  'admin.home_next_step_label',
  'admin.plan_plan_entry_desc',
  'admin.provider_scope_hint',
  'admin.provider_stale',
  'admin.provider_stale_desc',
  'admin.provider_type',
  'admin.sites.operational_desc',
  'marketing.home.final_cta_desc',
  'marketing.home.final_cta_portal',
  'marketing.home.how_works_step2_desc',
  'marketing.home.surface_overview_desc',
  'mock.portal_keys_surface',
  'mock.portal_login',
  'mock.portal_surface',
  'mock.portal_workspace',
  'mock.portal_workspace_badge',
  'portal.billing.site_context',
  'portal.home.secondary_desc',
  'portal.home.summary_desc',
];

describe('i18n retired dead keys', () => {
  it('keeps the retired dead keys out of every locale catalog', () => {
    for (const locale of Object.keys(translations) as Array<
      keyof typeof translations
    >) {
      const catalog = translations[locale];
      for (const key of retiredKeys) {
        expect(catalog, `${locale} must not resurrect ${key}`).not.toHaveProperty(
          key
        );
      }
    }
  });
});
