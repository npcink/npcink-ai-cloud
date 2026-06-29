'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BackofficeMetricStrip,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import { resolveUiErrorMessage } from '@/lib/errors';

type SettingStatus = 'ready' | 'disabled' | 'missing_config' | 'error' | string;

type ServiceSetting = {
  setting_id: string;
  enabled: boolean;
  configured: boolean;
  status: SettingStatus;
  config: Record<string, unknown>;
  secrets: Record<string, { configured: boolean; display: string }>;
  last_tested_at: string;
  last_error_code: string;
  last_error_message: string;
};

type ServiceSettingsData = {
  settings: {
    portal_public: ServiceSetting;
    qq_login: ServiceSetting;
    portal_email: ServiceSetting;
  };
};

type PortalPublicForm = {
  enabled: boolean;
  public_base_url: string;
};

type QQForm = {
  enabled: boolean;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scope: string;
  timeout_seconds: string;
};

type EmailForm = {
  enabled: boolean;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_use_ssl: boolean;
  smtp_use_starttls: boolean;
  smtp_timeout_seconds: string;
  from_email: string;
  from_name: string;
  reply_to: string;
};

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function statusLabel(status: SettingStatus): string {
  if (status === 'ready') return 'Ready';
  if (status === 'disabled') return 'Disabled';
  if (status === 'error') return 'Error';
  return 'Missing';
}

function statusTone(status: SettingStatus): string {
  if (status === 'ready') return 'text-emerald-700 dark:text-emerald-300';
  if (status === 'error') return 'text-rose-700 dark:text-rose-300';
  if (status === 'disabled') return 'text-slate-500 dark:text-slate-400';
  return 'text-amber-700 dark:text-amber-300';
}

function fieldClassName(): string {
  return 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950';
}

function checkboxClassName(): string {
  return 'h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950';
}

function labelClassName(): string {
  return 'text-sm font-medium text-slate-700 dark:text-slate-200';
}

export default function AdminServiceSettingsPage() {
  const { t } = useLocale();
  const [data, setData] = useState<ServiceSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [emailTestRecipient, setEmailTestRecipient] = useState('');

  const [portalPublicForm, setPortalPublicForm] = useState<PortalPublicForm>({
    enabled: true,
    public_base_url: '',
  });
  const [qqForm, setQqForm] = useState<QQForm>({
    enabled: true,
    client_id: '',
    client_secret: '',
    redirect_uri: '',
    scope: 'get_user_info',
    timeout_seconds: '10',
  });
  const [emailForm, setEmailForm] = useState<EmailForm>({
    enabled: true,
    smtp_host: '',
    smtp_port: '465',
    smtp_username: '',
    smtp_password: '',
    smtp_use_ssl: true,
    smtp_use_starttls: false,
    smtp_timeout_seconds: '20',
    from_email: '',
    from_name: '',
    reply_to: '',
  });

  async function loadSettings() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/service-settings', { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(resolveUiErrorMessage(payload, 'Failed to load service settings.'));
      }
      const nextData = payload?.data as ServiceSettingsData;
      setData(nextData);
      const portalPublic = nextData.settings.portal_public;
      const qq = nextData.settings.qq_login;
      const email = nextData.settings.portal_email;
      setPortalPublicForm({
        enabled: portalPublic.enabled,
        public_base_url: stringValue(portalPublic.config.public_base_url),
      });
      setQqForm({
        enabled: qq.enabled,
        client_id: stringValue(qq.config.client_id),
        client_secret: '',
        redirect_uri: stringValue(qq.config.redirect_uri),
        scope: stringValue(qq.config.scope) || 'get_user_info',
        timeout_seconds: stringValue(qq.config.timeout_seconds) || '10',
      });
      setEmailForm({
        enabled: email.enabled,
        smtp_host: stringValue(email.config.smtp_host),
        smtp_port: stringValue(email.config.smtp_port) || '465',
        smtp_username: stringValue(email.config.smtp_username),
        smtp_password: '',
        smtp_use_ssl: boolValue(email.config.smtp_use_ssl, true),
        smtp_use_starttls: boolValue(email.config.smtp_use_starttls, false),
        smtp_timeout_seconds: stringValue(email.config.smtp_timeout_seconds) || '20',
        from_email: stringValue(email.config.from_email),
        from_name: stringValue(email.config.from_name),
        reply_to: stringValue(email.config.reply_to),
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load service settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const metrics = useMemo(() => {
    const settings = data?.settings;
    return [
      {
        label: 'Public URL',
        value: statusLabel(settings?.portal_public.status || 'missing_config'),
        toneClassName: statusTone(settings?.portal_public.status || 'missing_config'),
        size: 'compact' as const,
      },
      {
        label: 'QQ Login',
        value: statusLabel(settings?.qq_login.status || 'missing_config'),
        toneClassName: statusTone(settings?.qq_login.status || 'missing_config'),
        size: 'compact' as const,
      },
      {
        label: 'Email',
        value: statusLabel(settings?.portal_email.status || 'missing_config'),
        toneClassName: statusTone(settings?.portal_email.status || 'missing_config'),
        size: 'compact' as const,
      },
    ];
  }, [data]);

  async function saveJson(path: string, body: Record<string, unknown>, savingKey: string, successMessage: string) {
    setSaving(savingKey);
    setError('');
    setNotice('');
    try {
      const response = await fetch(path, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(resolveUiErrorMessage(payload, 'Failed to save service settings.'));
      }
      setNotice(successMessage);
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save service settings.');
    } finally {
      setSaving('');
    }
  }

  async function postJson(path: string, body: Record<string, unknown>, savingKey: string, successMessage: string) {
    setSaving(savingKey);
    setError('');
    setNotice('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(resolveUiErrorMessage(payload, 'Failed to test service settings.'));
      }
      setNotice(successMessage);
      await loadSettings();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Failed to test service settings.');
    } finally {
      setSaving('');
    }
  }

  function submitPortalPublic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveJson(
      '/api/admin/service-settings/portal-public',
      portalPublicForm,
      'portal-public',
      'Portal public URL saved.'
    );
  }

  function submitQq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      enabled: qqForm.enabled,
      client_id: qqForm.client_id,
      redirect_uri: qqForm.redirect_uri,
      scope: qqForm.scope,
      timeout_seconds: Number(qqForm.timeout_seconds || 10),
    };
    if (qqForm.client_secret) {
      payload.client_secret = qqForm.client_secret;
    }
    void saveJson('/api/admin/service-settings/qq-login', payload, 'qq-login', 'QQ login settings saved.');
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      enabled: emailForm.enabled,
      smtp_host: emailForm.smtp_host,
      smtp_port: Number(emailForm.smtp_port || 465),
      smtp_username: emailForm.smtp_username,
      smtp_use_ssl: emailForm.smtp_use_ssl,
      smtp_use_starttls: emailForm.smtp_use_starttls,
      smtp_timeout_seconds: Number(emailForm.smtp_timeout_seconds || 20),
      from_email: emailForm.from_email,
      from_name: emailForm.from_name,
      reply_to: emailForm.reply_to,
    };
    if (emailForm.smtp_password) {
      payload.smtp_password = emailForm.smtp_password;
    }
    void saveJson('/api/admin/service-settings/email', payload, 'email', 'Email settings saved.');
  }

  const secretConfigured = {
    qq: Boolean(data?.settings.qq_login.secrets.client_secret?.configured),
    email: Boolean(data?.settings.portal_email.secrets.smtp_password?.configured),
  };

  return (
    <BackofficePageStack>
      <BackofficePrimaryPanel
        eyebrow={t('admin.operator_surface', {}, 'Operator surface')}
        title={t('admin.service_settings_title', {}, 'Service Settings')}
        description={t(
          'admin.service_settings_desc',
          {},
          'Configure Cloud-owned portal login and email delivery. Values are stored in Cloud runtime storage; environment fallback is disabled.'
        )}
        aside={(
          <div className="w-full xl:w-[34rem]">
            <BackofficeMetricStrip items={metrics} columnsClassName="md:grid-cols-3 xl:grid-cols-3" />
          </div>
        )}
      />

      {error ? (
        <BackofficeStackCard className="border-rose-200 bg-rose-50 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </BackofficeStackCard>
      ) : null}
      {notice ? (
        <BackofficeStackCard className="border-emerald-200 bg-emerald-50 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          {notice}
        </BackofficeStackCard>
      ) : null}

      <BackofficeSectionPanel className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Runtime URL
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
            Portal public URL
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Used for QQ redirect validation and portal email links.
          </p>
        </div>
        <form className="grid gap-4 lg:grid-cols-[1fr_auto]" onSubmit={submitPortalPublic}>
          <label className={labelClassName()}>
            Public base URL
            <input
              className={fieldClassName()}
              value={portalPublicForm.public_base_url}
              onChange={(event) => setPortalPublicForm((current) => ({ ...current, public_base_url: event.target.value }))}
              placeholder="https://cloud.example.com"
              disabled={loading}
            />
          </label>
          <div className="flex items-end gap-3">
            <label className="mb-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className={checkboxClassName()}
                checked={portalPublicForm.enabled}
                onChange={(event) => setPortalPublicForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
              Enabled
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving === 'portal-public'}>
              {saving === 'portal-public' ? 'Saving' : 'Save'}
            </button>
          </div>
        </form>
      </BackofficeSectionPanel>

      <BackofficeSectionPanel className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Authentication
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">QQ Login</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            The client secret is write-only. Leave it blank to keep the current value.
          </p>
        </div>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={submitQq}>
          <label className={labelClassName()}>
            Client ID
            <input className={fieldClassName()} value={qqForm.client_id} onChange={(event) => setQqForm((current) => ({ ...current, client_id: event.target.value }))} />
          </label>
          <label className={labelClassName()}>
            Client Secret {secretConfigured.qq ? '(configured)' : '(missing)'}
            <input className={fieldClassName()} type="password" value={qqForm.client_secret} onChange={(event) => setQqForm((current) => ({ ...current, client_secret: event.target.value }))} placeholder={secretConfigured.qq ? 'Keep existing secret' : 'Required'} />
          </label>
          <label className={labelClassName()}>
            Redirect URI
            <input className={fieldClassName()} value={qqForm.redirect_uri} onChange={(event) => setQqForm((current) => ({ ...current, redirect_uri: event.target.value }))} placeholder="https://cloud.example.com/portal/v1/auth/qq/callback" />
          </label>
          <label className={labelClassName()}>
            Scope
            <input className={fieldClassName()} value={qqForm.scope} onChange={(event) => setQqForm((current) => ({ ...current, scope: event.target.value }))} />
          </label>
          <label className={labelClassName()}>
            Timeout seconds
            <input className={fieldClassName()} value={qqForm.timeout_seconds} onChange={(event) => setQqForm((current) => ({ ...current, timeout_seconds: event.target.value }))} />
          </label>
          <div className="flex items-end justify-between gap-3">
            <label className="mb-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" className={checkboxClassName()} checked={qqForm.enabled} onChange={(event) => setQqForm((current) => ({ ...current, enabled: event.target.checked }))} />
              Enabled
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" disabled={saving === 'qq-test'} onClick={() => postJson('/api/admin/service-settings/qq-login/test', {}, 'qq-test', 'QQ login settings checked.')}>
                Test
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving === 'qq-login'}>
                {saving === 'qq-login' ? 'Saving' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </BackofficeSectionPanel>

      <BackofficeSectionPanel className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Delivery
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Portal Email</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            SMTP password is write-only. Test delivery sends one email to the recipient below.
          </p>
        </div>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={submitEmail}>
          <label className={labelClassName()}>
            SMTP Host
            <input className={fieldClassName()} value={emailForm.smtp_host} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_host: event.target.value }))} />
          </label>
          <label className={labelClassName()}>
            SMTP Port
            <input className={fieldClassName()} value={emailForm.smtp_port} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_port: event.target.value }))} />
          </label>
          <label className={labelClassName()}>
            Username
            <input className={fieldClassName()} value={emailForm.smtp_username} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_username: event.target.value }))} />
          </label>
          <label className={labelClassName()}>
            Password {secretConfigured.email ? '(configured)' : '(missing)'}
            <input className={fieldClassName()} type="password" value={emailForm.smtp_password} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_password: event.target.value }))} placeholder={secretConfigured.email ? 'Keep existing password' : 'Required when username is set'} />
          </label>
          <label className={labelClassName()}>
            From email
            <input className={fieldClassName()} value={emailForm.from_email} onChange={(event) => setEmailForm((current) => ({ ...current, from_email: event.target.value }))} />
          </label>
          <label className={labelClassName()}>
            From name
            <input className={fieldClassName()} value={emailForm.from_name} onChange={(event) => setEmailForm((current) => ({ ...current, from_name: event.target.value }))} />
          </label>
          <label className={labelClassName()}>
            Reply-to
            <input className={fieldClassName()} value={emailForm.reply_to} onChange={(event) => setEmailForm((current) => ({ ...current, reply_to: event.target.value }))} />
          </label>
          <label className={labelClassName()}>
            Timeout seconds
            <input className={fieldClassName()} value={emailForm.smtp_timeout_seconds} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_timeout_seconds: event.target.value }))} />
          </label>
          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-700 dark:text-slate-200">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className={checkboxClassName()} checked={emailForm.smtp_use_ssl} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_use_ssl: event.target.checked }))} />
              SSL
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className={checkboxClassName()} checked={emailForm.smtp_use_starttls} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_use_starttls: event.target.checked }))} />
              STARTTLS
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className={checkboxClassName()} checked={emailForm.enabled} onChange={(event) => setEmailForm((current) => ({ ...current, enabled: event.target.checked }))} />
              Enabled
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={saving === 'email'}>
              {saving === 'email' ? 'Saving' : 'Save'}
            </button>
          </div>
        </form>
        <BackofficeStackCard className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className={labelClassName()}>
            Test recipient
            <input className={fieldClassName()} value={emailTestRecipient} onChange={(event) => setEmailTestRecipient(event.target.value)} placeholder="operator@example.com" />
          </label>
          <div className="flex items-end justify-end">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving === 'email-test' || !emailTestRecipient}
              onClick={() => postJson('/api/admin/service-settings/email/test', { recipient_email: emailTestRecipient }, 'email-test', 'Test email sent.')}
            >
              Send test
            </button>
          </div>
        </BackofficeStackCard>
      </BackofficeSectionPanel>
    </BackofficePageStack>
  );
}
