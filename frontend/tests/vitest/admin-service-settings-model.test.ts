import { describe, expect, it } from 'vitest';
import {
  projectServiceSettingsForms,
  type ServiceSetting,
  type ServiceSettingsData,
} from '@/features/admin/service-settings/service-settings-model';

function setting(
  settingId: string,
  config: Record<string, unknown>,
  overrides: Partial<ServiceSetting> = {}
): ServiceSetting {
  return {
    setting_id: settingId,
    enabled: true,
    configured: true,
    status: 'ready',
    config,
    secrets: {},
    last_tested_at: '',
    last_error_code: '',
    last_error_message: '',
    ...overrides,
  };
}

function response(overrides: Partial<ServiceSettingsData['settings']> = {}): ServiceSettingsData {
  return {
    settings: {
      portal_public: setting('portal_public', { public_base_url: 'https://cloud.example.com' }),
      qq_login: setting('qq_login', { client_id: 12345 }),
      portal_email: setting('portal_email', {
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_username: 'Operator@Example.com',
        smtp_use_ssl: true,
        smtp_use_starttls: false,
        smtp_timeout_seconds: 30,
        from_email: 'operator@example.com',
        from_name: 'Npcink Cloud',
        reply_to: 'support@example.com',
      }),
      alipay_payment: setting('alipay_payment', {
        app_id: 20260001,
        notify_url: 'https://cloud.example.com/open/payments/alipay/notify',
        return_url: 'https://cloud.example.com/open/payments/alipay/return',
      }),
      accounting_fx: setting('accounting_fx', {
        usd_cny_rate: 7.25,
        effective_at: '2026-08-15T00:00:00Z',
        source: 'operator_approved',
        note: 'August rate',
      }),
      site_relink_policy: setting('site_relink_policy', { cooldown_days: 120 }),
      ...overrides,
    },
  };
}

describe('service settings response projection', () => {
  it('hydrates all form groups while keeping secret inputs blank', () => {
    const projection = projectServiceSettingsForms(response());

    expect(projection.savedForms).toEqual({
      portal: { enabled: true, public_base_url: 'https://cloud.example.com' },
      qq: { enabled: true, client_id: '12345', client_secret: '' },
      email: {
        enabled: true,
        smtp_host: 'smtp.example.com',
        smtp_port: '465',
        smtp_username: 'operator@example.com',
        smtp_username_same_as_from_email: true,
        smtp_password: '',
        smtp_use_ssl: true,
        smtp_use_starttls: false,
        smtp_timeout_seconds: '30',
        from_email: 'operator@example.com',
        from_name: 'Npcink Cloud',
        reply_to: 'support@example.com',
      },
      payment: {
        enabled: true,
        app_id: '20260001',
        notify_url: 'https://cloud.example.com/open/payments/alipay/notify',
        return_url: 'https://cloud.example.com/open/payments/alipay/return',
        private_key: '',
        public_key: '',
      },
      accounting: {
        usd_cny_rate: '7.25',
        effective_date: '2026-08-15',
        source: 'operator_approved',
        note: 'August rate',
      },
      siteRelink: { enabled: true, cooldown_days: '120' },
    });
    expect(projection.emailConfigExpanded).toBe(false);
  });

  it('supplies the accepted accounting fallback when an older response omits it', () => {
    const source = response();
    delete source.settings.accounting_fx;

    const projection = projectServiceSettingsForms(source);

    expect(projection.data.settings.accounting_fx).toMatchObject({
      setting_id: 'commercial_accounting_fx',
      configured: false,
      status: 'missing_config',
      config: {
        usd_cny_rate: '7.200000',
        source: 'platform_default',
        is_fallback: true,
      },
    });
    expect(projection.savedForms.accounting).toEqual({
      usd_cny_rate: '7.200000',
      effective_date: '2026-07-01',
      source: 'platform_default',
      note: '',
    });
  });

  it('uses safe email defaults and expands configuration only for attention states', () => {
    const email = setting('portal_email', {
      smtp_host: null,
      smtp_port: null,
      smtp_username: 'different@example.com',
      smtp_use_ssl: 'true',
      smtp_timeout_seconds: null,
      from_email: 'sender@example.com',
    }, { status: 'error' });

    const projection = projectServiceSettingsForms(response({ portal_email: email }));

    expect(projection.savedForms.email).toMatchObject({
      smtp_host: '',
      smtp_port: '465',
      smtp_username: 'different@example.com',
      smtp_username_same_as_from_email: false,
      smtp_use_ssl: true,
      smtp_use_starttls: false,
      smtp_timeout_seconds: '20',
      from_email: 'sender@example.com',
    });
    expect(projection.emailConfigExpanded).toBe(true);
  });
});
