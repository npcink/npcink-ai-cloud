export type SettingStatus = 'ready' | 'disabled' | 'missing_config' | 'error' | string;

export type ServiceSetting = {
  setting_id: string;
  setting_kind?: string;
  enabled: boolean;
  configured: boolean;
  status: SettingStatus;
  config: Record<string, unknown>;
  secrets: Record<string, { configured: boolean; display: string }>;
  last_tested_at: string;
  last_error_code: string;
  last_error_message: string;
};

export type ServiceSettingsData = {
  settings: {
    portal_public: ServiceSetting;
    qq_login: ServiceSetting;
    portal_email: ServiceSetting;
    alipay_payment: ServiceSetting;
    accounting_fx?: ServiceSetting;
    site_relink_policy: ServiceSetting;
    platform_preferences: ServiceSetting;
    media_recognition_policy: ServiceSetting;
    provider_budget: ProviderBudgetSetting;
  };
};

export type ProviderBudgetProvider = {
  provider_id: string;
  account_class: 'paid' | 'test' | string;
  daily_usd: number;
  monthly_usd: number;
};

export type ProviderBudgetRuntimeItem = {
  provider_id: string;
  account_class: string;
  period_kind: 'day' | 'month' | string;
  period_start_at?: string;
  period_end_at?: string;
  limit_cost_usd: number;
  reserved_cost_usd: number;
  remaining_cost_usd: number;
  utilization_ratio: number;
  warning: boolean;
  exceeded: boolean;
};

export type ProviderBudgetRuntime = {
  status: string;
  warning_ratio: number;
  configured_provider_count: number;
  missing_provider_ids: string[];
  items: ProviderBudgetRuntimeItem[];
  connections: Array<{ provider_id: string; display_name: string; enabled: boolean }>;
  generated_at: string;
  period_timezone: string;
};

export type ProviderBudgetSetting = ServiceSetting & {
  config: {
    warning_ratio: number;
    conservative_unpriced_cost_usd: number;
    require_provider_configuration: boolean;
    providers: ProviderBudgetProvider[];
  };
  runtime?: ProviderBudgetRuntime;
};

export type NormalizedServiceSettingsData = ServiceSettingsData & {
  settings: ServiceSettingsData['settings'] & {
    accounting_fx: ServiceSetting;
  };
};

export type PortalPublicForm = {
  enabled: boolean;
  public_base_url: string;
};

export type QQForm = {
  enabled: boolean;
  client_id: string;
  client_secret: string;
};

export type EmailForm = {
  enabled: boolean;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_username_same_as_from_email: boolean;
  smtp_password: string;
  smtp_use_ssl: boolean;
  smtp_use_starttls: boolean;
  smtp_timeout_seconds: string;
  from_email: string;
  from_name: string;
  reply_to: string;
};

export type AlipayForm = {
  enabled: boolean;
  app_id: string;
  notify_url: string;
  return_url: string;
  private_key: string;
  public_key: string;
};

export type SiteRelinkPolicyForm = {
  enabled: boolean;
  cooldown_days: string;
};

export type AccountingFxForm = {
  usd_cny_rate: string;
  effective_date: string;
  source: string;
  note: string;
};

export type PlatformPreferencesForm = {
  timezone: string;
};

export type SavedServiceSettingsForms = {
  portal: PortalPublicForm;
  qq: QQForm;
  email: EmailForm;
  payment: AlipayForm;
  accounting: AccountingFxForm;
  siteRelink: SiteRelinkPolicyForm;
  platformPreferences: PlatformPreferencesForm;
  providerBudget: ProviderBudgetForm;
};

export type ProviderBudgetForm = {
  enabled: boolean;
  warning_ratio: string;
  conservative_unpriced_cost_usd: string;
  require_provider_configuration: boolean;
  providers: ProviderBudgetProviderForm[];
};

export type ProviderBudgetProviderForm = {
  row_id: string;
  provider_id: string;
  account_class: 'paid' | 'test';
  daily_usd: string;
  monthly_usd: string;
};

export type ServiceSettingsProjection = {
  data: NormalizedServiceSettingsData;
  savedForms: SavedServiceSettingsForms;
  emailConfigExpanded: boolean;
};

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function providerBudgetProviders(value: unknown): ProviderBudgetProviderForm[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const accountClass = stringValue(record.account_class) === 'test' ? 'test' : 'paid';
    return [{
      row_id: `provider-budget-row-${index}`,
      provider_id: stringValue(record.provider_id),
      account_class: accountClass,
      daily_usd: stringValue(record.daily_usd) || '0',
      monthly_usd: stringValue(record.monthly_usd) || '0',
    }];
  });
}

function fallbackProviderBudget(): ProviderBudgetSetting {
  return {
    setting_id: 'provider_account_spend_budget',
    setting_kind: 'runtime',
    enabled: false,
    configured: false,
    status: 'disabled',
    config: {
      warning_ratio: 0.8,
      conservative_unpriced_cost_usd: 0.05,
      require_provider_configuration: true,
      providers: [],
    },
    secrets: {},
    last_tested_at: '',
    last_error_code: '',
    last_error_message: '',
  };
}

function providerBudgetWarningPercent(config: unknown): string {
  const raw = (config as { warning_ratio?: unknown } | null | undefined)?.warning_ratio;
  const parsed = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0.8;
  const bounded = Math.min(1, Math.max(0.01, parsed));
  return String(Math.round(bounded * 1000) / 10);
}

function fallbackAccountingFx(): ServiceSetting {
  return {
    setting_id: 'commercial_accounting_fx',
    enabled: true,
    configured: false,
    status: 'missing_config',
    config: {
      usd_cny_rate: '7.200000',
      effective_at: '2026-07-01T00:00:00Z',
      source: 'platform_default',
      note: '',
      rate_version: 'usd-cny-20260701T000000Z-7_200000',
      is_fallback: true,
    },
    secrets: {},
    last_tested_at: '',
    last_error_code: '',
    last_error_message: '',
  };
}

export function projectServiceSettingsForms(
  source: ServiceSettingsData
): ServiceSettingsProjection {
  const portalPublic = source.settings.portal_public;
  const qq = source.settings.qq_login;
  const email = source.settings.portal_email;
  const alipay = source.settings.alipay_payment;
  const accountingFx = source.settings.accounting_fx || fallbackAccountingFx();
  const siteRelinkPolicy = source.settings.site_relink_policy;
  const platformPreferences = source.settings.platform_preferences;
  const providerBudget = source.settings.provider_budget || fallbackProviderBudget();
  const emailSmtpUsername = stringValue(email.config.smtp_username);
  const emailFromAddress = stringValue(email.config.from_email);
  const emailUsernameSameAsFromEmail =
    Boolean(emailSmtpUsername && emailFromAddress) &&
    emailSmtpUsername.toLowerCase() === emailFromAddress.toLowerCase();

  const savedForms: SavedServiceSettingsForms = {
    portal: {
      enabled: portalPublic.enabled,
      public_base_url: stringValue(portalPublic.config.public_base_url),
    },
    qq: {
      enabled: qq.enabled,
      client_id: stringValue(qq.config.client_id),
      client_secret: '',
    },
    email: {
      enabled: email.enabled,
      smtp_host: stringValue(email.config.smtp_host),
      smtp_port: stringValue(email.config.smtp_port) || '465',
      smtp_username: emailUsernameSameAsFromEmail ? emailFromAddress : emailSmtpUsername,
      smtp_username_same_as_from_email: emailUsernameSameAsFromEmail,
      smtp_password: '',
      smtp_use_ssl: boolValue(email.config.smtp_use_ssl, true),
      smtp_use_starttls: boolValue(email.config.smtp_use_starttls, false),
      smtp_timeout_seconds: stringValue(email.config.smtp_timeout_seconds) || '20',
      from_email: emailFromAddress,
      from_name: stringValue(email.config.from_name),
      reply_to: stringValue(email.config.reply_to),
    },
    payment: {
      enabled: alipay.enabled,
      app_id: stringValue(alipay.config.app_id),
      notify_url: stringValue(alipay.config.notify_url),
      return_url: stringValue(alipay.config.return_url),
      private_key: '',
      public_key: '',
    },
    accounting: {
      usd_cny_rate: stringValue(accountingFx.config.usd_cny_rate) || '7.200000',
      effective_date:
        stringValue(accountingFx.config.effective_at).slice(0, 10) || '2026-07-01',
      source: stringValue(accountingFx.config.source) || 'operator_approved',
      note: stringValue(accountingFx.config.note),
    },
    siteRelink: {
      enabled: siteRelinkPolicy.enabled,
      cooldown_days: stringValue(siteRelinkPolicy.config.cooldown_days) || '90',
    },
    platformPreferences: {
      timezone: stringValue(platformPreferences.config.timezone) || 'Asia/Shanghai',
    },
    providerBudget: {
      enabled: providerBudget.enabled,
      warning_ratio: providerBudgetWarningPercent(providerBudget.config),
      conservative_unpriced_cost_usd:
        stringValue((providerBudget.config as { conservative_unpriced_cost_usd?: unknown } | null | undefined)?.conservative_unpriced_cost_usd) || '0.05',
      require_provider_configuration: boolValue(
        (providerBudget.config as { require_provider_configuration?: unknown } | null | undefined)?.require_provider_configuration,
        true,
      ),
      providers: providerBudgetProviders(
        (providerBudget.config as { providers?: unknown } | null | undefined)?.providers,
      ),
    },
  };

  return {
    data: {
      ...source,
      settings: {
        ...source.settings,
        accounting_fx: accountingFx,
        provider_budget: providerBudget,
      },
    },
    savedForms,
    emailConfigExpanded: email.status === 'missing_config' || email.status === 'error',
  };
}
