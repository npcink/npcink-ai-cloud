'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BackofficeConfigurationHeader,
  BackofficeDiagnosticNotice,
  BackofficePageStack,
} from '@/components/backoffice/BackofficeScaffold';
import { AdminRouteSkeleton } from '@/components/admin/AdminRouteSkeleton';
import {
  AdminConfigurationRow,
  AdminConfigurationTable,
} from '@/components/admin/AdminConfigurationTable';
import { AdminCredentialField } from '@/components/admin/AdminCredentialField';
import { AdminSettingsWorkbench } from '@/components/admin/AdminSettingsWorkbench';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
  projectServiceSettingsForms,
  type AccountingFxForm,
  type AlipayForm,
  type EmailForm,
  type NormalizedServiceSettingsData,
  type PortalPublicForm,
  type QQForm,
  type SavedServiceSettingsForms,
  type ServiceSettingsData,
  type SettingStatus,
  type SiteRelinkPolicyForm,
} from '@/features/admin/service-settings/service-settings-model';

type ServiceSettingsTab = 'portal' | 'qq' | 'email' | 'payment' | 'accounting' | 'site-relink';
type EmailPreviewType = 'login' | 'registration' | 'email_change' | 'email_changed' | 'test';
type EmailPreviewMode = 'html' | 'text';
type Translator = (key: string, params?: Record<string, string>, fallback?: string) => string;

const serviceSettingsClient = createApiClient({
  cache: 'default',
  idempotencyPrefix: 'admin_service_settings',
});

type EmailPreview = {
  preview_type: string;
  subject: string;
  text: string;
  html: string;
  from_name: string;
  from_email: string;
  recommended_from_name: string;
};

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function statusLabel(status: SettingStatus, t: Translator): string {
  if (status === 'ready') return t('admin.service_settings.status_ready', {}, 'Ready');
  if (status === 'disabled') return t('admin.service_settings.status_disabled', {}, 'Disabled');
  if (status === 'error') return t('admin.service_settings.status_error', {}, 'Error');
  return t('admin.service_settings.status_missing_config', {}, 'Not configured');
}

function statusTone(status: SettingStatus): string {
  if (status === 'ready') return 'text-emerald-700 dark:text-emerald-300';
  if (status === 'error') return 'text-rose-700 dark:text-rose-300';
  if (status === 'disabled') return 'text-slate-500 dark:text-slate-400';
  return 'text-amber-700 dark:text-amber-300';
}

function fieldClassName(): string {
  return 'input mt-1 w-full';
}

function checkboxClassName(): string {
  return 'h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950';
}

function switchButtonClassName(checked: boolean): string {
  return `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-blue-950 ${
    checked
      ? 'border-blue-600 bg-blue-600'
      : 'border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800'
  }`;
}

function switchKnobClassName(checked: boolean): string {
  return `inline-block h-5 w-5 rounded-full bg-white shadow-sm transition ${
    checked ? 'translate-x-5' : 'translate-x-0.5'
  }`;
}

function labelClassName(): string {
  return 'text-sm font-medium text-slate-700 dark:text-slate-200';
}

function buildQqRedirectUri(publicBaseUrl: string): string {
  const raw = publicBaseUrl.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}/open/auth/qq/callback`;
  } catch {
    return '';
  }
}

function buildAlipayNotifyUrl(publicBaseUrl: string): string {
  const raw = publicBaseUrl.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}/open/payments/alipay/notify`;
  } catch {
    return '';
  }
}

function buildAlipayReturnUrl(publicBaseUrl: string): string {
  const raw = publicBaseUrl.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}/open/payments/alipay/return`;
  } catch {
    return '';
  }
}

function inferBrowserPublicBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const parsed = new URL(window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '::1' ||
      parsed.hostname.startsWith('127.')
    ) {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function serviceSettingsErrorDetail(
  errorCode: string,
  rawMessage: string,
  fallback: string,
  t: Translator
): string {
  if (errorCode === 'service_settings.email_delivery_failed') {
    if (/Authentication failure|authentication failed|auth/i.test(rawMessage)) {
      return t('admin.service_settings.error_email_auth_failed', {}, 'SMTP 服务器拒绝认证。请检查 SMTP 用户名、密码或应用专用密码，并确认发件邮箱已启用 SMTP。');
    }
    if (/timed out|timeout/i.test(rawMessage)) {
      return t('admin.service_settings.error_email_timeout', {}, 'The SMTP connection timed out. Check the SMTP host, port, SSL/STARTTLS mode, and network connectivity.');
    }
    if (/Name or service not known|getaddrinfo|ENOTFOUND/i.test(rawMessage)) {
      return t('admin.service_settings.error_email_host_lookup', {}, 'The SMTP host could not be resolved. Check the SMTP server domain.');
    }
    return rawMessage
      ? t('admin.service_settings.error_email_delivery_detail', { message: rawMessage }, 'Test email failed: {{message}}')
      : t('admin.service_settings.error_email_delivery_failed', {}, 'Test email failed. Check the SMTP host, port, authentication, and encryption mode.');
  }
  if (errorCode === 'service_settings.email_tls_mode_invalid') {
    return t('admin.service_settings.error_tls_mode_invalid', {}, 'SMTP 加密方式不能同时启用 SSL 和 STARTTLS。465 端口通常只使用 SSL，587 端口通常只使用 STARTTLS。');
  }
  if (errorCode === 'service_settings.email_password_required') {
    return t(
      'admin.service_settings.error_email_password_required',
      {},
      '已有 SMTP 密码密文无法用当前运行时密钥读取。请重新输入 SMTP 密码或应用专用授权码并保存。'
    );
  }
  if (errorCode === 'service_settings.email_username_required') {
    return t('admin.service_settings.error_email_username_required', {}, 'SMTP username is required when an SMTP password is set.');
  }
  if (errorCode === 'service_settings.email_smtp_host_required') {
    return t('admin.service_settings.error_email_smtp_host_required', {}, 'Enter an SMTP server.');
  }
  if (errorCode === 'service_settings.email_from_email_invalid') {
    return t('admin.service_settings.error_email_from_invalid', {}, 'Enter a valid sender email address.');
  }
  if (errorCode === 'service_settings.alipay_private_key_required') {
    return t('admin.service_settings.error_alipay_private_key_required', {}, '请输入支付宝应用私钥。');
  }
  if (errorCode === 'service_settings.alipay_public_key_required') {
    return t('admin.service_settings.error_alipay_public_key_required', {}, '请输入支付宝公钥。');
  }
  if (errorCode === 'service_settings.alipay_notify_url_invalid') {
    return t('admin.service_settings.error_alipay_notify_url_invalid', {}, '支付宝异步通知地址必须来自门户基础地址，并使用 /open/payments/alipay/notify。');
  }
  if (errorCode === 'service_settings.alipay_return_url_invalid') {
    return t('admin.service_settings.error_alipay_return_url_invalid', {}, '支付宝同步返回地址必须来自门户基础地址，并使用 /open/payments/alipay/return。');
  }
  if (errorCode === 'service_settings.alipay_config_invalid') {
    if (/Could not deserialize key data|ASN\.1|unsupported key type|incorrect format/i.test(rawMessage)) {
      return t('admin.service_settings.error_alipay_key_format', {}, '支付宝密钥格式无效。应用私钥请填写应用私钥，支付宝公钥请填写支付宝开放平台提供的支付宝公钥；支持 PEM 格式或裸 Base64 内容。');
    }
    return rawMessage
      ? t('admin.service_settings.error_alipay_config_detail', { message: rawMessage }, '支付宝配置检查失败：{{message}}')
      : t('admin.service_settings.error_alipay_config_invalid', {}, '支付宝配置检查失败。请检查 App ID、应用私钥、支付宝公钥。');
  }
  return resolveUiErrorMessage(rawMessage, fallback);
}

function serviceSettingsRequestErrorMessage(
  error: unknown,
  fallback: string,
  t: Translator
): string {
  if (!(error instanceof ApiError)) {
    return resolveUiErrorMessage(error, fallback);
  }

  const message = serviceSettingsErrorDetail(error.errorCode, error.message, fallback, t);
  if (error.errorCode.startsWith('service_settings.')) {
    return error.statusCode >= 500
      ? t('admin.service_settings.error_http_suffix', { message, status: String(error.statusCode) }, '{{message}} (HTTP {{status}}).')
      : message;
  }
  if (error.statusCode >= 500) {
    return t('admin.service_settings.error_http_migration_hint', { message, status: String(error.statusCode) }, '{{message}}（HTTP {{status}}）。请确认数据库迁移已执行，并查看 API 日志。');
  }
  return message;
}

function settingTone(status: SettingStatus): 'ready' | 'attention' | 'neutral' | 'error' {
  if (status === 'ready') return 'ready';
  if (status === 'error') return 'error';
  if (status === 'missing_config') return 'attention';
  return 'neutral';
}

export default function AdminServiceSettingsPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { success: showSuccessToast } = useToast();
  const [activeTab, setActiveTab] = useState<ServiceSettingsTab>('portal');
  const [pendingTab, setPendingTab] = useState<ServiceSettingsTab | null>(null);
  const [pendingNavigationHref, setPendingNavigationHref] = useState('');
  const [data, setData] = useState<NormalizedServiceSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [emailTestRecipient, setEmailTestRecipient] = useState('');
  const [emailPreviewType, setEmailPreviewType] = useState<EmailPreviewType>('login');
  const [emailPreviewMode, setEmailPreviewMode] = useState<EmailPreviewMode>('html');
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [emailConfigExpanded, setEmailConfigExpanded] = useState(false);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [browserPublicBaseUrl, setBrowserPublicBaseUrl] = useState('');
  const [qqCredentialRevealed, setQqCredentialRevealed] = useState(false);
  const [emailCredentialRevealed, setEmailCredentialRevealed] = useState(false);
  const [alipayPrivateKeyRevealed, setAlipayPrivateKeyRevealed] = useState(false);
  const [alipayPublicKeyRevealed, setAlipayPublicKeyRevealed] = useState(false);

  const [portalPublicForm, setPortalPublicForm] = useState<PortalPublicForm>({
    enabled: true,
    public_base_url: '',
  });
  const [qqForm, setQqForm] = useState<QQForm>({
    enabled: true,
    client_id: '',
    client_secret: '',
  });
  const [emailForm, setEmailForm] = useState<EmailForm>({
    enabled: true,
    smtp_host: '',
    smtp_port: '465',
    smtp_username: '',
    smtp_username_same_as_from_email: false,
    smtp_password: '',
    smtp_use_ssl: true,
    smtp_use_starttls: false,
    smtp_timeout_seconds: '20',
    from_email: '',
    from_name: '',
    reply_to: '',
  });
  const [alipayForm, setAlipayForm] = useState<AlipayForm>({
    enabled: false,
    app_id: '',
    notify_url: '',
    return_url: '',
    private_key: '',
    public_key: '',
  });
  const [siteRelinkPolicyForm, setSiteRelinkPolicyForm] = useState<SiteRelinkPolicyForm>({
    enabled: true,
    cooldown_days: '90',
  });
  const [accountingFxForm, setAccountingFxForm] = useState<AccountingFxForm>({
    usd_cny_rate: '7.200000',
    effective_date: '2026-07-01',
    source: 'operator_approved',
    note: '',
  });
  const [savedForms, setSavedForms] = useState<SavedServiceSettingsForms | null>(null);
  const savedFormsRef = useRef<SavedServiceSettingsForms | null>(null);
  const settingsMountedRef = useRef(false);
  const settingsRequestActiveRef = useRef(false);
  const settingsRequestSequenceRef = useRef(0);

  useEffect(() => {
    if (!notice) {
      return;
    }
    showSuccessToast(
      notice,
      t('admin.service_settings.operation_completed_title', {}, 'Service setting updated')
    );
    setNotice('');
  }, [notice, showSuccessToast, t]);

  const loadSettings = useCallback(async function loadSettings() {
    if (settingsRequestActiveRef.current) {
      return;
    }
    const requestSequence = settingsRequestSequenceRef.current + 1;
    settingsRequestSequenceRef.current = requestSequence;
    settingsRequestActiveRef.current = true;
    setLoading(true);
    setError('');
    try {
      const nextData = (await serviceSettingsClient.request<ServiceSettingsData>(
        '/api/admin/service-settings'
      )).data;
      if (!nextData?.settings) {
        throw new Error(t('admin.service_settings.invalid_response', {}, 'Service settings response is invalid.'));
      }
      if (!settingsMountedRef.current || settingsRequestSequenceRef.current !== requestSequence) {
        return;
      }
      const projection = projectServiceSettingsForms(nextData);
      setData(projection.data);
      setEmailConfigExpanded(projection.emailConfigExpanded);
      const nextSavedForms = projection.savedForms;
      savedFormsRef.current = nextSavedForms;
      setSavedForms(nextSavedForms);
      setPortalPublicForm(nextSavedForms.portal);
      setQqForm(nextSavedForms.qq);
      setEmailForm(nextSavedForms.email);
      setAlipayForm(nextSavedForms.payment);
      setAccountingFxForm(nextSavedForms.accounting);
      setSiteRelinkPolicyForm(nextSavedForms.siteRelink);
      setQqCredentialRevealed(false);
      setEmailCredentialRevealed(false);
      setAlipayPrivateKeyRevealed(false);
      setAlipayPublicKeyRevealed(false);
    } catch (loadError) {
      if (settingsMountedRef.current && settingsRequestSequenceRef.current === requestSequence) {
        setError(serviceSettingsRequestErrorMessage(loadError, t('admin.service_settings.load_failed', {}, 'Failed to load service settings.'), t));
      }
    } finally {
      if (settingsRequestSequenceRef.current === requestSequence) {
        settingsRequestActiveRef.current = false;
        if (settingsMountedRef.current) {
          setLoading(false);
        }
      }
    }
  }, [t]);

  useEffect(() => {
    settingsMountedRef.current = true;
    void loadSettings();
    return () => {
      settingsMountedRef.current = false;
    };
  }, [loadSettings]);

  useEffect(() => {
    setBrowserPublicBaseUrl(inferBrowserPublicBaseUrl());
  }, []);

  const metrics = useMemo(() => {
    const settings = data?.settings;
    return [
      {
        label: t('admin.service_settings.metric_public_url', {}, 'Public URL'),
        value: statusLabel(settings?.portal_public.status || 'missing_config', t),
        toneClassName: statusTone(settings?.portal_public.status || 'missing_config'),
        size: 'compact' as const,
      },
      {
        label: t('admin.service_settings.metric_qq_login', {}, 'QQ login'),
        value: statusLabel(settings?.qq_login.status || 'missing_config', t),
        toneClassName: statusTone(settings?.qq_login.status || 'missing_config'),
        size: 'compact' as const,
      },
      {
        label: t('admin.service_settings.metric_email', {}, 'Email delivery'),
        value: statusLabel(settings?.portal_email.status || 'missing_config', t),
        toneClassName: statusTone(settings?.portal_email.status || 'missing_config'),
        size: 'compact' as const,
      },
      {
        label: t('admin.service_settings.metric_payment', {}, 'Payment'),
        value: statusLabel(settings?.alipay_payment.status || 'missing_config', t),
        toneClassName: statusTone(settings?.alipay_payment.status || 'missing_config'),
        size: 'compact' as const,
      },
      {
        label: t('admin.service_settings.metric_accounting_fx', {}, 'Accounting FX'),
        value: `${stringValue(settings?.accounting_fx.config.usd_cny_rate) || '7.200000'} CNY/USD`,
        toneClassName: statusTone(settings?.accounting_fx.status || 'missing_config'),
        size: 'compact' as const,
      },
      {
        label: t('admin.service_settings.metric_site_relink', {}, 'Site relink'),
        value: settings?.site_relink_policy.enabled
          ? `${stringValue(settings.site_relink_policy.config.cooldown_days) || '90'} ${t('common.days', {}, 'days')}`
          : t('admin.service_settings.site_relink_disabled', {}, 'Cross-account disabled'),
        toneClassName: settings?.site_relink_policy.enabled
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-slate-500 dark:text-slate-400',
        size: 'compact' as const,
      },
    ];
  }, [data, t]);

  const qqRedirectUri = useMemo(() => {
    return buildQqRedirectUri(portalPublicForm.public_base_url);
  }, [portalPublicForm.public_base_url]);

  const savedPortalPublicBaseUrl = portalPublicForm.public_base_url.trim();
  const effectivePortalPublicBaseUrl = savedPortalPublicBaseUrl || browserPublicBaseUrl;
  const portalPublicAutosavePending = !savedPortalPublicBaseUrl && Boolean(browserPublicBaseUrl);

  const defaultAlipayNotifyUrl = useMemo(() => {
    return buildAlipayNotifyUrl(effectivePortalPublicBaseUrl);
  }, [effectivePortalPublicBaseUrl]);

  const defaultAlipayReturnUrl = useMemo(() => {
    return buildAlipayReturnUrl(effectivePortalPublicBaseUrl);
  }, [effectivePortalPublicBaseUrl]);

  const resolvedAlipayNotifyUrl = alipayForm.notify_url || defaultAlipayNotifyUrl;
  const resolvedAlipayReturnUrl = alipayForm.return_url || defaultAlipayReturnUrl;

  async function copyQqRedirectUri() {
    if (!qqRedirectUri) {
      setError(t('admin.service_settings.public_base_url_required', {}, 'Enter a valid public base URL first.'));
      setNotice('');
      return;
    }
    try {
      await navigator.clipboard.writeText(qqRedirectUri);
      setError('');
      setNotice(t('admin.service_settings.qq_redirect_copied', {}, 'QQ 回调地址已复制。'));
    } catch {
      setError(t('admin.service_settings.copy_failed', {}, 'This browser could not copy automatically. Copy the redirect URL manually.'));
      setNotice('');
    }
  }

  async function copyText(value: string, successMessage: string) {
    if (!value) {
      setError(t('admin.service_settings.copy_empty', {}, 'Nothing to copy yet.'));
      setNotice('');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setError('');
      setNotice(successMessage);
    } catch {
      setError(t('admin.service_settings.copy_failed', {}, 'This browser could not copy automatically. Copy the value manually.'));
      setNotice('');
    }
  }

  async function writeJson(
    path: string,
    method: 'PATCH' | 'POST',
    body: Record<string, unknown>
  ): Promise<unknown> {
    return (await serviceSettingsClient.request<unknown>(path, {
      method,
      body,
    })).data;
  }

  async function saveJson(
    path: string,
    body: Record<string, unknown>,
    savingKey: string,
    successMessage: string
  ) {
    setSaving(savingKey);
    setError('');
    setNotice('');
    const fallbackMessage = t('admin.service_settings.save_failed', {}, 'Failed to save service settings.');
    try {
      await writeJson(path, 'PATCH', body);
      setNotice(successMessage);
      await loadSettings();
    } catch (saveError) {
      setError(serviceSettingsRequestErrorMessage(saveError, fallbackMessage, t));
    } finally {
      setSaving('');
    }
  }

  async function postJson(
    path: string,
    body: Record<string, unknown>,
    savingKey: string,
    successMessage: string
  ) {
    setSaving(savingKey);
    setError('');
    setNotice('');
    const fallbackMessage = t('admin.service_settings.test_failed', {}, 'Failed to test service settings.');
    try {
      await writeJson(path, 'POST', body);
      setNotice(successMessage);
      await loadSettings();
    } catch (testError) {
      setError(serviceSettingsRequestErrorMessage(testError, fallbackMessage, t));
    } finally {
      setSaving('');
    }
  }

  async function loadEmailPreview(type: EmailPreviewType = emailPreviewType) {
    setSaving('email-preview');
    setError('');
    try {
      const preview = (await serviceSettingsClient.request<EmailPreview>(
        '/api/admin/service-settings/email/preview',
        {
          method: 'POST',
          body: {
            preview_type: type,
            locale: 'zh-CN',
            from_name: emailForm.from_name,
            from_email: emailForm.from_email,
          },
        }
      )).data;
      if (!preview?.html || !preview.subject) {
        throw new Error(t('admin.service_settings.email_preview_invalid', {}, 'Email preview response is invalid.'));
      }
      setEmailPreview(preview);
      setNotice('');
    } catch (previewError) {
      setEmailPreview(null);
      setError(serviceSettingsRequestErrorMessage(previewError, t('admin.service_settings.email_preview_failed', {}, 'Failed to load email preview.'), t));
    } finally {
      setSaving('');
    }
  }

  function openEmailPreviewDrawer() {
    setEmailPreviewOpen(true);
    if (!emailPreview) {
      void loadEmailPreview();
    }
  }

  function submitPortalPublic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeValidationIssues.length > 0) {
      setError(activeValidationIssues[0]);
      return;
    }
    void saveJson(
      '/api/admin/service-settings/portal-public',
      portalPublicForm,
      'portal-public',
      t('admin.service_settings.public_url_saved', {}, 'Public URL saved.')
    );
  }

  function submitSiteRelinkPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeValidationIssues.length > 0) {
      setError(activeValidationIssues[0]);
      return;
    }
    void saveJson(
      '/api/admin/service-settings/site-relink-policy',
      {
        enabled: siteRelinkPolicyForm.enabled,
        cooldown_days: Number(siteRelinkPolicyForm.cooldown_days),
      },
      'site-relink-policy',
      t(
        'admin.service_settings.site_relink_saved',
        {},
        'Site relink policy saved.'
      )
    );
  }

  function submitAccountingFx(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeValidationIssues.length > 0) {
      setError(activeValidationIssues[0]);
      return;
    }
    void saveJson(
      '/api/admin/service-settings/accounting-fx',
      {
        usd_cny_rate: Number(accountingFxForm.usd_cny_rate),
        effective_at: `${accountingFxForm.effective_date}T00:00:00Z`,
        source: accountingFxForm.source,
        note: accountingFxForm.note,
      },
      'accounting-fx',
      t('admin.service_settings.accounting_fx_saved', {}, 'Accounting FX rate saved.')
    );
  }

  function submitQq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeValidationIssues.length > 0) {
      setError(activeValidationIssues[0]);
      return;
    }
    if (!qqRedirectUri) {
      setNotice('');
      setError(t('admin.service_settings.qq_redirect_requires_public_url', {}, 'Enter a valid public base URL first. The QQ redirect URL is generated automatically.'));
      return;
    }
    const payload: Record<string, unknown> = {
      enabled: qqForm.enabled,
      client_id: qqForm.client_id,
      redirect_uri: qqRedirectUri,
      scope: 'get_user_info',
      timeout_seconds: 10,
    };
    if (qqForm.client_secret) {
      payload.client_secret = qqForm.client_secret;
    }
    void saveJson('/api/admin/service-settings/qq-login', payload, 'qq-login', t('admin.service_settings.qq_saved', {}, 'QQ login settings saved.'));
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeValidationIssues.length > 0) {
      setError(activeValidationIssues[0]);
      return;
    }
    if (emailForm.smtp_use_ssl && emailForm.smtp_use_starttls) {
      setNotice('');
      setError(t('admin.service_settings.error_tls_mode_invalid', {}, 'SSL and STARTTLS cannot be enabled at the same time. Port 465 usually uses SSL only; port 587 usually uses STARTTLS only.'));
      return;
    }
    const payload: Record<string, unknown> = {
      enabled: emailForm.enabled,
      smtp_host: emailForm.smtp_host,
      smtp_port: Number(emailForm.smtp_port || 465),
      smtp_username: emailForm.smtp_username_same_as_from_email
        ? emailForm.from_email
        : emailForm.smtp_username,
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
    void saveJson('/api/admin/service-settings/email', payload, 'email', t('admin.service_settings.email_saved', {}, 'Email settings saved.'));
  }

  async function submitAlipay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeValidationIssues.length > 0) {
      setError(activeValidationIssues[0]);
      return;
    }
    const alipayPublicBaseUrl = savedPortalPublicBaseUrl || browserPublicBaseUrl;
    const nextAlipayNotifyUrl = alipayForm.notify_url || buildAlipayNotifyUrl(alipayPublicBaseUrl);
    const nextAlipayReturnUrl = alipayForm.return_url || buildAlipayReturnUrl(alipayPublicBaseUrl);
    if (alipayForm.enabled && (!nextAlipayNotifyUrl || !nextAlipayReturnUrl)) {
      setNotice('');
      setError(t('admin.service_settings.alipay_requires_public_url', {}, '支付宝回调地址需要先确定公开访问域名。请先保存门户基础地址，系统会自动生成 notify_url 和 return_url。'));
      return;
    }
    const payload: Record<string, unknown> = {
      enabled: alipayForm.enabled,
      app_id: alipayForm.app_id,
      notify_url: nextAlipayNotifyUrl,
      return_url: nextAlipayReturnUrl,
    };
    if (alipayForm.private_key) {
      payload.private_key = alipayForm.private_key;
    }
    if (alipayForm.public_key) {
      payload.public_key = alipayForm.public_key;
    }
    setSaving('alipay-payment');
    setError('');
    setNotice('');
    const fallbackMessage = t('admin.service_settings.save_failed', {}, '保存服务配置失败。');
    try {
      if (alipayForm.enabled && !savedPortalPublicBaseUrl && browserPublicBaseUrl) {
        await writeJson(
          '/api/admin/service-settings/portal-public',
          'PATCH',
          {
            ...portalPublicForm,
            enabled: true,
            public_base_url: browserPublicBaseUrl,
          }
        );
      }
      await writeJson('/api/admin/service-settings/alipay-payment', 'PATCH', payload);
      setNotice(
        !savedPortalPublicBaseUrl && browserPublicBaseUrl
          ? t('admin.service_settings.alipay_saved_with_public_url', { baseUrl: browserPublicBaseUrl }, '已先保存门户基础地址 {{baseUrl}}，并保存支付宝支付配置。')
          : t('admin.service_settings.alipay_saved', {}, '支付宝支付配置已保存。')
      );
      await loadSettings();
    } catch (saveError) {
      setError(serviceSettingsRequestErrorMessage(saveError, fallbackMessage, t));
    } finally {
      setSaving('');
    }
  }

  const secretConfigured = {
    qq: Boolean(data?.settings.qq_login.secrets.client_secret?.configured),
    email: Boolean(data?.settings.portal_email.secrets.smtp_password?.configured),
    alipayPrivateKey: Boolean(data?.settings.alipay_payment.secrets.private_key?.configured),
    alipayPublicKey: Boolean(data?.settings.alipay_payment.secrets.public_key?.configured),
  };
  const activeGroupDirty = (() => {
    if (!savedForms) return false;
    if (activeTab === 'portal') return JSON.stringify(portalPublicForm) !== JSON.stringify(savedForms.portal);
    if (activeTab === 'qq') return JSON.stringify(qqForm) !== JSON.stringify(savedForms.qq);
    if (activeTab === 'email') return JSON.stringify(emailForm) !== JSON.stringify(savedForms.email);
    if (activeTab === 'site-relink') {
      return JSON.stringify(siteRelinkPolicyForm) !== JSON.stringify(savedForms.siteRelink);
    }
    if (activeTab === 'accounting') {
      return JSON.stringify(accountingFxForm) !== JSON.stringify(savedForms.accounting);
    }
    return JSON.stringify(alipayForm) !== JSON.stringify(savedForms.payment);
  })();

  const activeValidationIssues = (() => {
    const issues: string[] = [];
    if (activeTab === 'portal') {
      try {
        const parsed = new URL(portalPublicForm.public_base_url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('unsupported protocol');
        }
      } catch {
        issues.push(t('admin.service_settings.validation_public_url', {}, 'Enter a valid HTTP or HTTPS public URL.'));
      }
    }
    if (activeTab === 'qq' && qqForm.enabled) {
      if (!qqForm.client_id.trim()) {
        issues.push(t('admin.service_settings.validation_qq_app_id', {}, 'Enter the QQ App ID.'));
      }
      if (!secretConfigured.qq && !qqForm.client_secret.trim()) {
        issues.push(t('admin.service_settings.validation_qq_secret', {}, 'Enter the QQ App Secret.'));
      }
      if (!qqRedirectUri) {
        issues.push(t('admin.service_settings.validation_qq_redirect', {}, 'Save a valid Portal public URL before enabling QQ login.'));
      }
    }
    if (activeTab === 'email' && emailForm.enabled) {
      const port = Number(emailForm.smtp_port);
      const timeout = Number(emailForm.smtp_timeout_seconds);
      if (!emailForm.smtp_host.trim()) {
        issues.push(t('admin.service_settings.validation_email_host', {}, 'Enter the SMTP server.'));
      }
      if (!emailForm.from_email.includes('@')) {
        issues.push(t('admin.service_settings.validation_email_sender', {}, 'Enter a valid sender email address.'));
      }
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        issues.push(t('admin.service_settings.validation_email_port', {}, 'Enter a valid SMTP port from 1 to 65535.'));
      }
      if (!Number.isFinite(timeout) || timeout <= 0) {
        issues.push(t('admin.service_settings.validation_email_timeout', {}, 'Enter a positive SMTP timeout.'));
      }
      if (emailForm.smtp_use_ssl && emailForm.smtp_use_starttls) {
        issues.push(t('admin.service_settings.error_tls_mode_invalid', {}, 'SSL and STARTTLS cannot be enabled at the same time.'));
      }
      const username = emailForm.smtp_username_same_as_from_email
        ? emailForm.from_email.trim()
        : emailForm.smtp_username.trim();
      if (username && !secretConfigured.email && !emailForm.smtp_password.trim()) {
        issues.push(t('admin.service_settings.validation_email_password', {}, 'Enter the SMTP password for the configured username.'));
      }
      if (!username && emailForm.smtp_password.trim()) {
        issues.push(t('admin.service_settings.validation_email_username', {}, 'Enter the SMTP username before entering a password.'));
      }
    }
    if (activeTab === 'payment' && alipayForm.enabled) {
      if (!effectivePortalPublicBaseUrl) {
        issues.push(t('admin.service_settings.validation_payment_public_url', {}, 'Save a public URL before enabling Alipay.'));
      }
      if (!alipayForm.app_id.trim()) {
        issues.push(t('admin.service_settings.validation_payment_app_id', {}, 'Enter the Alipay App ID.'));
      }
      if (!secretConfigured.alipayPrivateKey && !alipayForm.private_key.trim()) {
        issues.push(t('admin.service_settings.validation_payment_private_key', {}, 'Enter the Alipay application private key.'));
      }
      if (!secretConfigured.alipayPublicKey && !alipayForm.public_key.trim()) {
        issues.push(t('admin.service_settings.validation_payment_public_key', {}, 'Enter the Alipay public key.'));
      }
    }
    if (activeTab === 'site-relink') {
      const cooldownDays = Number(siteRelinkPolicyForm.cooldown_days);
      if (
        !Number.isInteger(cooldownDays) ||
        cooldownDays < 90 ||
        cooldownDays > 365
      ) {
        issues.push(
          t(
            'admin.service_settings.validation_site_relink_days',
            {},
            'Enter a whole number from 90 to 365 days.'
          )
        );
      }
    }
    if (activeTab === 'accounting') {
      const rate = Number(accountingFxForm.usd_cny_rate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 20) {
        issues.push(
          t(
            'admin.service_settings.validation_accounting_fx_rate',
            {},
            'Enter a USD/CNY rate greater than 0 and no greater than 20.'
          )
        );
      }
      if (!accountingFxForm.effective_date) {
        issues.push(
          t(
            'admin.service_settings.validation_accounting_fx_date',
            {},
            'Select the accounting rate effective date.'
          )
        );
      }
      if (!accountingFxForm.source.trim()) {
        issues.push(
          t(
            'admin.service_settings.validation_accounting_fx_source',
            {},
            'Enter the accounting rate source.'
          )
        );
      }
    }
    return issues;
  })();

  const restoreActiveGroup = useCallback(() => {
    const saved = savedFormsRef.current;
    if (!saved) return;
    if (activeTab === 'portal') setPortalPublicForm(saved.portal);
    if (activeTab === 'qq') setQqForm(saved.qq);
    if (activeTab === 'email') setEmailForm(saved.email);
    if (activeTab === 'payment') setAlipayForm(saved.payment);
    if (activeTab === 'site-relink') setSiteRelinkPolicyForm(saved.siteRelink);
    if (activeTab === 'accounting') setAccountingFxForm(saved.accounting);
    if (activeTab === 'qq') setQqCredentialRevealed(false);
    if (activeTab === 'email') setEmailCredentialRevealed(false);
    if (activeTab === 'payment') {
      setAlipayPrivateKeyRevealed(false);
      setAlipayPublicKeyRevealed(false);
    }
    setError('');
  }, [activeTab]);

  const requestTabChange = useCallback((nextTab: ServiceSettingsTab) => {
    if (nextTab === activeTab) return;
    if (activeGroupDirty) {
      setPendingTab(nextTab);
      return;
    }
    setError('');
    setActiveTab(nextTab);
  }, [activeGroupDirty, activeTab]);

  useEffect(() => {
    if (!activeGroupDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank') return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigationHref(`${destination.pathname}${destination.search}${destination.hash}`);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleAnchorClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleAnchorClick, true);
    };
  }, [activeGroupDirty]);

  const emailSetting = data?.settings.portal_email;
  const emailStatus = emailSetting?.status || 'missing_config';
  const emailServerSummary = emailForm.smtp_host
    ? `${emailForm.smtp_host}:${emailForm.smtp_port || '465'}`
    : t('admin.service_settings.email_summary_not_configured', {}, 'Not configured');
  const emailSenderSummary = emailForm.from_email
    ? `${emailForm.from_name || 'Npcink AI Cloud'} <${emailForm.from_email}>`
    : t('admin.service_settings.email_summary_not_configured', {}, 'Not configured');
  const emailEncryptionSummary = emailForm.smtp_use_ssl
    ? 'SSL'
    : emailForm.smtp_use_starttls
      ? 'STARTTLS'
      : t('admin.service_settings.email_summary_no_encryption', {}, 'None');
  const emailLastTestedSummary = emailSetting?.last_tested_at
    ? emailSetting.last_tested_at
    : t('admin.service_settings.email_summary_never_tested', {}, 'Never tested');

  const tabs: Array<{
    id: ServiceSettingsTab;
    label: string;
    description: string;
    tone: 'ready' | 'attention' | 'neutral' | 'error';
  }> = [
    {
      id: 'portal',
      label: t('admin.service_settings.tab_portal', {}, '门户地址'),
      description: activeTab === 'portal' && activeGroupDirty
        ? t('admin.service_settings.unsaved_short', {}, 'Unsaved')
        : statusLabel(data?.settings.portal_public.status || 'missing_config', t),
      tone: activeTab === 'portal' && activeGroupDirty
        ? 'attention'
        : settingTone(data?.settings.portal_public.status || 'missing_config'),
    },
    {
      id: 'qq',
      label: t('admin.service_settings.tab_qq', {}, 'QQ 登录'),
      description: activeTab === 'qq' && activeGroupDirty
        ? t('admin.service_settings.unsaved_short', {}, 'Unsaved')
        : statusLabel(data?.settings.qq_login.status || 'missing_config', t),
      tone: activeTab === 'qq' && activeGroupDirty
        ? 'attention'
        : settingTone(data?.settings.qq_login.status || 'missing_config'),
    },
    {
      id: 'email',
      label: t('admin.service_settings.tab_email', {}, '邮件配置'),
      description: activeTab === 'email' && activeGroupDirty
        ? t('admin.service_settings.unsaved_short', {}, 'Unsaved')
        : statusLabel(data?.settings.portal_email.status || 'missing_config', t),
      tone: activeTab === 'email' && activeGroupDirty
        ? 'attention'
        : settingTone(data?.settings.portal_email.status || 'missing_config'),
    },
    {
      id: 'payment',
      label: t('admin.service_settings.tab_payment', {}, '支付配置'),
      description: activeTab === 'payment' && activeGroupDirty
        ? t('admin.service_settings.unsaved_short', {}, 'Unsaved')
        : statusLabel(data?.settings.alipay_payment.status || 'missing_config', t),
      tone: activeTab === 'payment' && activeGroupDirty
        ? 'attention'
        : settingTone(data?.settings.alipay_payment.status || 'missing_config'),
    },
    {
      id: 'accounting',
      label: t('admin.service_settings.tab_accounting', {}, '成本核算'),
      description: activeTab === 'accounting' && activeGroupDirty
        ? t('admin.service_settings.unsaved_short', {}, 'Unsaved')
        : statusLabel(data?.settings.accounting_fx.status || 'missing_config', t),
      tone: activeTab === 'accounting' && activeGroupDirty
        ? 'attention'
        : settingTone(data?.settings.accounting_fx.status || 'missing_config'),
    },
    {
      id: 'site-relink',
      label: t('admin.service_settings.tab_site_relink', {}, '站点重连'),
      description: activeTab === 'site-relink' && activeGroupDirty
        ? t('admin.service_settings.unsaved_short', {}, 'Unsaved')
        : data?.settings.site_relink_policy.enabled
          ? `${stringValue(data.settings.site_relink_policy.config.cooldown_days) || '90'} ${t('common.days', {}, 'days')}`
          : t('admin.service_settings.site_relink_disabled', {}, 'Cross-account disabled'),
      tone: activeTab === 'site-relink' && activeGroupDirty
        ? 'attention'
        : data?.settings.site_relink_policy.enabled
          ? 'ready'
          : 'neutral',
    },
  ];

  const emailPreviewOptions: Array<{ id: EmailPreviewType; label: string }> = [
    {
      id: 'login',
      label: t('admin.service_settings.email_preview_login', {}, '登录验证码'),
    },
    {
      id: 'registration',
      label: t('admin.service_settings.email_preview_registration', {}, '注册验证码'),
    },
    {
      id: 'email_change',
      label: t('admin.service_settings.email_preview_email_change', {}, '更换邮箱验证码'),
    },
    {
      id: 'email_changed',
      label: t('admin.service_settings.email_preview_email_changed', {}, '邮箱已更换通知'),
    },
    {
      id: 'test',
      label: t('admin.service_settings.email_preview_test', {}, '测试邮件'),
    },
  ];
  const activeStateNotice = (activeGroupDirty || activeValidationIssues.length > 0 || error) ? (
    <div
      data-ui="service-settings-active-state"
      role={error || activeValidationIssues.length > 0 ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-3 border-l-2 px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between',
        error || activeValidationIssues.length > 0
          ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200'
      )}
    >
      <div>
        <p className="font-semibold">
          {error
            ? t('admin.service_settings.action_failed_title', {}, 'This configuration action failed')
            : activeValidationIssues.length > 0
              ? t('admin.service_settings.validation_title', {}, 'Resolve these fields before saving')
              : t('admin.service_settings.unsaved_title', {}, 'Unsaved changes')}
        </p>
        {error ? <p className="mt-1">{error}</p> : null}
        {activeValidationIssues.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {activeValidationIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        ) : activeGroupDirty ? (
          <p className="mt-1">
            {t('admin.service_settings.unsaved_desc', {}, 'Save this group before testing it or opening another configuration group.')}
          </p>
        ) : null}
      </div>
      {activeGroupDirty ? (
        <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={restoreActiveGroup}>
          {t('admin.service_settings.restore_saved_values', {}, 'Restore saved values')}
        </button>
      ) : null}
    </div>
  ) : null;

  if (loading && !data) {
    return <AdminRouteSkeleton />;
  }

  if (!data) {
    return (
      <BackofficePageStack>
        <BackofficeConfigurationHeader
          eyebrow={t('admin.operator_surface', {}, 'Operator surface')}
          title={t('admin.service_settings_title', {}, 'Service settings')}
          description={t('admin.service_settings.load_shell_desc', {}, 'The service-settings shell remains available while this bounded configuration read is retried.')}
          summaryItems={[{
            label: t('common.status', {}, 'Status'),
            value: statusLabel('error', t),
            toneClassName: statusTone('error'),
            size: 'compact',
          }]}
        />
        <BackofficeDiagnosticNotice
          message={error || t('admin.service_settings.load_failed', {}, 'Failed to load service settings.')}
          retryLabel={t('common.retry')}
          onRetry={() => void loadSettings()}
        />
      </BackofficePageStack>
    );
  }

  return (
    <BackofficePageStack className="space-y-3">
      <BackofficeConfigurationHeader
        eyebrow={t('admin.operator_surface', {}, 'Operator surface')}
        title={t('admin.service_settings_title', {}, 'Service settings')}
        description={t(
          'admin.service_settings_desc',
          {},
          'Configure Cloud-owned Portal login, QQ quick login, email delivery, and payment. Values are stored in Cloud runtime storage; .env fallback is no longer read.'
        )}
        summaryItems={metrics}
      />

      <AdminSettingsWorkbench
        ariaLabel={t('admin.service_settings.tablist_label', {}, 'Service settings categories')}
        activeId={activeTab}
        items={tabs.map((tab) => ({
          id: tab.id,
          label: tab.label,
          status: tab.description,
          tone: tab.tone,
        }))}
        onSelect={(nextTab) => requestTabChange(nextTab as ServiceSettingsTab)}
      >

      {activeTab === 'portal' ? (
          <div id="service-settings-portal" className="grid gap-3" role="tabpanel">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="shrink-0 text-base font-semibold text-slate-950 dark:text-white">
                {t('admin.service_settings.portal_public_title', {}, '门户基础地址')}
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {t('admin.service_settings.portal_public_desc', {}, 'Used to generate public callback URLs for QQ login, WeChat login, and payment notifications.')}
              </p>
            </div>
            {activeStateNotice}
            <form className="grid gap-3" onSubmit={submitPortalPublic}>
              <AdminConfigurationTable
                ariaLabel={t('admin.service_settings.portal_public_title', {}, 'Portal public URL')}
                itemHeading={t('admin.service_settings.configuration_item', {}, 'Setting')}
                valueHeading={t('admin.service_settings.current_value', {}, 'Current value')}
                detailHeading={t('admin.service_settings.action_or_note', {}, 'Action / note')}
                density="compact"
              >
                <AdminConfigurationRow
                  rowId="portal-base-url"
                  label={t('admin.service_settings.base_url_label', {}, 'Base URL')}
                  value={<input
                  className="input w-full"
                  value={portalPublicForm.public_base_url}
                  onChange={(event) => setPortalPublicForm((current) => ({ ...current, public_base_url: event.target.value }))}
                  placeholder="https://cloud.example.com"
                  disabled={loading}
                  aria-label={t('admin.service_settings.base_url_label', {}, 'Base URL')}
                />}
                  detail={browserPublicBaseUrl && portalPublicForm.public_base_url.trim() !== browserPublicBaseUrl ? (
                    <button
                      type="button"
                      className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                      disabled={saving === 'portal-public'}
                      onClick={() => setPortalPublicForm((current) => ({ ...current, enabled: true, public_base_url: browserPublicBaseUrl }))}
                    >
                      {t('admin.service_settings.use_current_base_url', {}, 'Use current URL')}
                    </button>
                  ) : t('admin.service_settings.callback_source_note', {}, 'Callback URL source')}
                />
                <AdminConfigurationRow
                  rowId="portal-enabled"
                  label={t('admin.service_settings.portal_enabled_label', {}, 'Portal entry enabled')}
                  value={portalPublicForm.enabled
                    ? t('common.enabled', {}, 'Enabled')
                    : t('common.disabled', {}, 'Disabled')}
                  detail={<label className="inline-flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                  <button
                    type="button"
                    role="switch"
                    aria-label={t('admin.service_settings.public_url_toggle_label', {}, 'Enable public URL')}
                    aria-checked={portalPublicForm.enabled}
                    className={switchButtonClassName(portalPublicForm.enabled)}
                    disabled={loading}
                    onClick={() => setPortalPublicForm((current) => ({ ...current, enabled: !current.enabled }))}
                  >
                    <span className={switchKnobClassName(portalPublicForm.enabled)} />
                  </button>
                  {t('admin.service_settings.portal_enabled_label', {}, 'Portal entry enabled')}
                  </label>}
                />
              </AdminConfigurationTable>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={saving === 'portal-public' || !activeGroupDirty || activeValidationIssues.length > 0}
                >
                  {saving === 'portal-public'
                    ? t('admin.service_settings.saving', {}, 'Saving')
                    : t('admin.service_settings.save_base_url', {}, '保存基础地址')}
                </button>
              </div>
            </form>
          </div>
      ) : null}

      {activeTab === 'accounting' ? (
          <div id="service-settings-accounting" className="grid gap-3" role="tabpanel">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="shrink-0 text-base font-semibold text-slate-950 dark:text-white">
                {t('admin.service_settings.accounting_fx_title', {}, 'USD/CNY accounting rate')}
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'admin.service_settings.accounting_fx_desc',
                  {},
                  'Provider costs remain in USD; Cloud snapshots the approved rate and the converted CNY amount for operator accounting.'
                )}
              </p>
            </div>
            {activeStateNotice}
            <form className="grid gap-3" onSubmit={submitAccountingFx}>
              <AdminConfigurationTable
                ariaLabel={t('admin.service_settings.accounting_fx_title', {}, 'USD/CNY accounting rate')}
                itemHeading={t('admin.service_settings.configuration_item', {}, 'Setting')}
                valueHeading={t('admin.service_settings.current_value', {}, 'Current value')}
                detailHeading={t('admin.service_settings.action_or_note', {}, 'Action / note')}
                density="compact"
              >
                <AdminConfigurationRow
                  rowId="accounting-fx-rate"
                  label={t('admin.service_settings.accounting_fx_rate_label', {}, 'CNY per USD')}
                  value={<input
                    className="input w-full"
                    type="number"
                    min="0.000001"
                    max="20"
                    step="0.000001"
                    value={accountingFxForm.usd_cny_rate}
                    onChange={(event) => setAccountingFxForm((current) => ({
                      ...current,
                      usd_cny_rate: event.target.value,
                    }))}
                  />}
                  detail={t(
                    'admin.service_settings.accounting_fx_rate_detail',
                    {},
                    'One global operator-approved rate. It is not a customer currency selector.'
                  )}
                />
                <AdminConfigurationRow
                  rowId="accounting-fx-effective-date"
                  label={t('admin.service_settings.accounting_fx_effective_label', {}, 'Effective date')}
                  value={<input
                    className="input w-full"
                    type="date"
                    value={accountingFxForm.effective_date}
                    onChange={(event) => setAccountingFxForm((current) => ({
                      ...current,
                      effective_date: event.target.value,
                    }))}
                  />}
                  detail={stringValue(data.settings.accounting_fx.config.rate_version)}
                />
                <AdminConfigurationRow
                  rowId="accounting-fx-source"
                  label={t('admin.service_settings.accounting_fx_source_label', {}, 'Source')}
                  value={<input
                    className="input w-full"
                    maxLength={128}
                    value={accountingFxForm.source}
                    onChange={(event) => setAccountingFxForm((current) => ({
                      ...current,
                      source: event.target.value,
                    }))}
                  />}
                  detail={t(
                    'admin.service_settings.accounting_fx_source_detail',
                    {},
                    'For example: operator-approved monthly accounting rate.'
                  )}
                />
                <AdminConfigurationRow
                  rowId="accounting-fx-note"
                  label={t('admin.service_settings.accounting_fx_note_label', {}, 'Note')}
                  value={<input
                    className="input w-full"
                    maxLength={500}
                    value={accountingFxForm.note}
                    onChange={(event) => setAccountingFxForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))}
                  />}
                  detail={data.settings.accounting_fx.config.is_fallback
                    ? t(
                        'admin.service_settings.accounting_fx_fallback',
                        {},
                        'The fallback rate is active. Save an operator-approved rate before relying on CNY margin reporting.'
                      )
                    : t(
                        'admin.service_settings.accounting_fx_snapshot_note',
                        {},
                        'New provider-cost events snapshot this rate version; historical snapshots are not rewritten.'
                      )}
                />
              </AdminConfigurationTable>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={
                    saving === 'accounting-fx' ||
                    !activeGroupDirty ||
                    activeValidationIssues.length > 0
                  }
                >
                  {saving === 'accounting-fx'
                    ? t('admin.service_settings.saving', {}, 'Saving')
                    : t('admin.service_settings.save_accounting_fx', {}, 'Save accounting rate')}
                </button>
              </div>
            </form>
          </div>
      ) : null}

      {activeTab === 'site-relink' ? (
          <div id="service-settings-site-relink" className="grid gap-3" role="tabpanel">
              <div className="flex min-w-0 items-baseline gap-3">
                <h2 className="shrink-0 text-base font-semibold text-slate-950 dark:text-white">
                  {t(
                    'admin.service_settings.site_relink_title',
                    {},
                    '跨账号站点重连'
                  )}
                </h2>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    'admin.service_settings.site_relink_desc',
                    {},
                    'The cooldown starts only after the current account removes the site. Same-account reconnects remain available immediately, and Free entitlement stays account-owned.'
                  )}
                </p>
              </div>
              {activeStateNotice}
              <form className="space-y-5" onSubmit={submitSiteRelinkPolicy}>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)]">
                  <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">
                          {t(
                            'admin.service_settings.site_relink_enabled_label',
                            {},
                            'Allow cross-account relink after cooldown'
                          )}
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {t(
                            'admin.service_settings.site_relink_enabled_hint',
                            {},
                            'When disabled, a removed site remains unavailable to other accounts until this policy is enabled or an operator changes the site record.'
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-label={t(
                          'admin.service_settings.site_relink_toggle_label',
                          {},
                          'Enable cross-account site relink'
                        )}
                        aria-checked={siteRelinkPolicyForm.enabled}
                        className={switchButtonClassName(siteRelinkPolicyForm.enabled)}
                        disabled={loading}
                        onClick={() =>
                          setSiteRelinkPolicyForm((current) => ({
                            ...current,
                            enabled: !current.enabled,
                          }))
                        }
                      >
                        <span className={switchKnobClassName(siteRelinkPolicyForm.enabled)} />
                      </button>
                    </div>
                  </div>
                  <label className={labelClassName()}>
                    {t(
                      'admin.service_settings.site_relink_days_label',
                      {},
                      'Default cooldown days'
                    )}
                    <input
                      type="number"
                      min={90}
                      max={365}
                      step={1}
                      className={fieldClassName()}
                      value={siteRelinkPolicyForm.cooldown_days}
                      onChange={(event) =>
                        setSiteRelinkPolicyForm((current) => ({
                          ...current,
                          cooldown_days: event.target.value,
                        }))
                      }
                      disabled={loading}
                    />
                    <span className="mt-2 block text-xs font-normal text-slate-500 dark:text-slate-400">
                      {t(
                        'admin.service_settings.site_relink_days_hint',
                        {},
                        'Applies to future removals. Existing sites keep their stored unlock time until changed from site detail.'
                      )}
                    </span>
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={
                      saving === 'site-relink-policy' ||
                      !activeGroupDirty ||
                      activeValidationIssues.length > 0
                    }
                  >
                    {saving === 'site-relink-policy'
                      ? t('admin.service_settings.saving', {}, 'Saving')
                      : t(
                          'admin.service_settings.save_site_relink',
                          {},
                          '保存重连策略'
                        )}
                  </button>
                </div>
              </form>
          </div>
      ) : null}

      {activeTab === 'qq' ? (
          <div id="service-settings-qq" className="grid gap-3" role="tabpanel">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="shrink-0 text-base font-semibold text-slate-950 dark:text-white">{t('admin.service_settings.qq_title', {}, 'QQ 快捷登录')}</h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {t('admin.service_settings.qq_desc', {}, '回调地址由门户基础地址自动生成。这里仅保存 QQ 应用凭证和登录开关。')}
              </p>
            </div>
            {activeStateNotice}
            <form className="grid gap-4 lg:grid-cols-2" onSubmit={submitQq}>
              <label className={labelClassName()}>
                App ID
                <input className={fieldClassName()} value={qqForm.client_id} disabled={loading} onChange={(event) => setQqForm((current) => ({ ...current, client_id: event.target.value }))} />
              </label>
              <AdminCredentialField
                mode={secretConfigured.qq ? 'edit' : 'create'}
                revealed={qqCredentialRevealed}
                value={qqForm.client_secret}
                label={`App Secret ${secretConfigured.qq
                  ? t('admin.service_settings.secret_configured_suffix', {}, '(configured)')
                  : t('admin.service_settings.secret_missing_suffix', {}, '(not configured)')}`}
                unchangedLabel={t('admin.service_settings.credential_unchanged', {}, 'Current saved credential remains unchanged')}
                replaceLabel={t('admin.service_settings.replace_credential', {}, 'Replace credential')}
                cancelReplacementLabel={t('admin.service_settings.cancel_credential_replacement', {}, 'Cancel replacement')}
                keepCurrentPlaceholder={t('admin.service_settings.qq_secret_keep_placeholder', {}, 'Leave empty to keep the current secret')}
                density="compact"
                onChange={(value) => setQqForm((current) => ({ ...current, client_secret: value }))}
                onReveal={() => setQqCredentialRevealed(true)}
                onCancelReplacement={() => {
                  setQqCredentialRevealed(false);
                  setQqForm((current) => ({ ...current, client_secret: '' }));
                }}
              />
              <div className="lg:col-span-2">
                <div className={labelClassName()}>
                  {t('admin.service_settings.redirect_uri_label', {}, 'Redirect URL')}
                  <div className="mt-1 grid gap-2 lg:grid-cols-[1fr_auto]">
                    <input
                      className={fieldClassName()}
                      value={qqRedirectUri}
                      aria-label={t('admin.service_settings.redirect_uri_label', {}, 'Redirect URL')}
                      readOnly
                      disabled={loading}
                      placeholder={t('admin.service_settings.redirect_uri_placeholder', {}, 'Generated after a public base URL is entered')}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!qqRedirectUri}
                      onClick={() => void copyQqRedirectUri()}
                    >
                      {t('common.copy', {}, 'Copy')}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3 lg:col-span-2">
                <div className="mb-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <button
                    type="button"
                    role="switch"
                    aria-label={t('admin.service_settings.qq_toggle_label', {}, '启用 QQ 快捷登录')}
                    aria-checked={qqForm.enabled}
                    className={switchButtonClassName(qqForm.enabled)}
                    disabled={loading}
                    onClick={() => setQqForm((current) => ({ ...current, enabled: !current.enabled }))}
                  >
                    <span className={switchKnobClassName(qqForm.enabled)} />
                  </button>
                  {t('admin.service_settings.qq_enabled_label', {}, '启用 QQ 登录')}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary" disabled={saving === 'qq-test' || activeGroupDirty || activeValidationIssues.length > 0} onClick={() => postJson('/api/admin/service-settings/qq-login/test', {}, 'qq-test', t('admin.service_settings.qq_test_done', {}, 'QQ login configuration check completed.'))}>
                    {t('admin.service_settings.check_qq', {}, 'Check QQ settings')}
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving === 'qq-login' || !activeGroupDirty || activeValidationIssues.length > 0}>
                    {saving === 'qq-login'
                      ? t('admin.service_settings.saving', {}, 'Saving')
                      : t('admin.service_settings.save_qq', {}, '保存 QQ 配置')}
                  </button>
                </div>
              </div>
            </form>
          </div>
      ) : null}

      {activeTab === 'email' ? (
          <div id="service-settings-email" className="space-y-4" role="tabpanel">
            <section className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex min-w-0 items-baseline gap-3">
                  <h2 className="shrink-0 text-base font-semibold text-slate-950 dark:text-white">{t('admin.service_settings.email_title', {}, 'Email delivery')}</h2>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.service_settings.email_summary_desc', {}, '常用检查保留在页面上；低频 SMTP 字段需要编辑时再展开。')}
                  </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEmailConfigExpanded((current) => !current)}
                >
                  {emailConfigExpanded
                    ? t('admin.service_settings.email_config_collapse', {}, '收起 SMTP 配置')
                    : t('admin.service_settings.email_config_edit', {}, '编辑 SMTP 配置')}
                </button>
              </div>

              {activeStateNotice}

              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40 md:grid-cols-2 xl:grid-cols-5">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.service_settings.email_summary_status', {}, 'Status')}
                  </div>
                  <div className={`mt-1 font-semibold ${statusTone(emailStatus)}`}>
                    {statusLabel(emailStatus, t)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.service_settings.email_summary_server', {}, 'Server')}
                  </div>
                  <div className="mt-1 break-all font-semibold text-slate-900 dark:text-slate-100">
                    {emailServerSummary}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.service_settings.email_summary_sender', {}, 'Sender')}
                  </div>
                  <div className="mt-1 break-all font-semibold text-slate-900 dark:text-slate-100">
                    {emailSenderSummary}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.service_settings.email_summary_encryption', {}, 'Encryption')}
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {emailEncryptionSummary}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.service_settings.email_summary_last_tested', {}, 'Last test')}
                  </div>
                  <div className="mt-1 break-all font-semibold text-slate-900 dark:text-slate-100">
                    {emailLastTestedSummary}
                  </div>
                </div>
              </div>

              {emailConfigExpanded ? (
            <form className="grid gap-4 lg:grid-cols-2" onSubmit={submitEmail}>
              <label className={labelClassName()}>
                {t('admin.service_settings.smtp_host_label', {}, 'SMTP server')}
                <input className={fieldClassName()} value={emailForm.smtp_host} disabled={loading} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_host: event.target.value }))} />
              </label>
              <label className={labelClassName()}>
                {t('admin.service_settings.smtp_port_label', {}, 'SMTP port')}
                <input className={fieldClassName()} value={emailForm.smtp_port} disabled={loading} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_port: event.target.value }))} />
              </label>
              <label className={labelClassName()}>
                <span className="flex items-center justify-between gap-3">
                  <span>{t('admin.service_settings.smtp_username_label', {}, 'SMTP username')}</span>
                  <span className="inline-flex items-center gap-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                    <input
                      type="checkbox"
                      className={checkboxClassName()}
                      checked={emailForm.smtp_username_same_as_from_email}
                      disabled={loading}
                      onChange={(event) =>
                        setEmailForm((current) => ({
                          ...current,
                          smtp_username_same_as_from_email: event.target.checked,
                          smtp_username: event.target.checked
                            ? current.from_email
                            : current.smtp_username,
                        }))
                      }
                    />
                    {t('admin.service_settings.same_as_from_email', {}, '同发件邮箱')}
                  </span>
                </span>
                <input
                  className={fieldClassName()}
                  value={
                    emailForm.smtp_username_same_as_from_email
                      ? emailForm.from_email
                      : emailForm.smtp_username
                  }
                  disabled={loading || emailForm.smtp_username_same_as_from_email}
                  onChange={(event) =>
                    setEmailForm((current) => ({
                      ...current,
                      smtp_username: event.target.value,
                    }))
                  }
                  placeholder={
                    emailForm.smtp_username_same_as_from_email
                      ? t('admin.service_settings.auto_from_email_placeholder', {}, 'Uses the sender email automatically')
                      : t('admin.service_settings.smtp_username_placeholder', {}, 'Usually the full email address')
                  }
                />
              </label>
              <AdminCredentialField
                mode={secretConfigured.email ? 'edit' : 'create'}
                revealed={emailCredentialRevealed}
                value={emailForm.smtp_password}
                label={`${t('admin.service_settings.smtp_password_label', {}, 'SMTP password')} ${secretConfigured.email
                  ? t('admin.service_settings.secret_configured_suffix', {}, '(configured)')
                  : t('admin.service_settings.secret_missing_suffix', {}, '(not configured)')}`}
                unchangedLabel={t('admin.service_settings.credential_unchanged', {}, 'Current saved credential remains unchanged')}
                replaceLabel={t('admin.service_settings.replace_credential', {}, 'Replace credential')}
                cancelReplacementLabel={t('admin.service_settings.cancel_credential_replacement', {}, 'Cancel replacement')}
                keepCurrentPlaceholder={t('admin.service_settings.email_password_keep_placeholder', {}, 'Leave empty to keep the current password')}
                density="compact"
                onChange={(value) => setEmailForm((current) => ({ ...current, smtp_password: value }))}
                onReveal={() => setEmailCredentialRevealed(true)}
                onCancelReplacement={() => {
                  setEmailCredentialRevealed(false);
                  setEmailForm((current) => ({ ...current, smtp_password: '' }));
                }}
              />
              <label className={labelClassName()}>
                {t('admin.service_settings.from_email_label', {}, 'Sender email')}
                <input
                  className={fieldClassName()}
                  value={emailForm.from_email}
                  disabled={loading}
                  onChange={(event) =>
                    setEmailForm((current) => ({
                      ...current,
                      from_email: event.target.value,
                      smtp_username: current.smtp_username_same_as_from_email
                        ? event.target.value
                        : current.smtp_username,
                    }))
                  }
                />
              </label>
	              <label className={labelClassName()}>
	                {t('admin.service_settings.from_name_label', {}, 'Sender name')}
	                <input
	                  className={fieldClassName()}
	                  value={emailForm.from_name}
	                  disabled={loading}
	                  onChange={(event) =>
	                    setEmailForm((current) => ({
	                      ...current,
	                      from_name: event.target.value,
	                    }))
	                  }
	                  placeholder="Npcink AI Cloud"
	                />
	                <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
	                  <div className="flex flex-wrap items-center justify-between gap-2">
	                    <span>
	                      {t(
	                        'admin.service_settings.from_name_recommendation',
	                        {},
	                        '建议使用 Npcink AI Cloud。收件箱会把它显示为发件人名称，更容易和服务品牌对应。'
	                      )}
	                    </span>
	                    <button
	                      type="button"
	                      className="text-xs font-semibold underline-offset-4 hover:underline"
	                      disabled={loading}
	                      onClick={() =>
	                        setEmailForm((current) => ({
	                          ...current,
	                          from_name: 'Npcink AI Cloud',
	                        }))
	                      }
	                    >
	                      {t('admin.service_settings.use_recommended_from_name', {}, '使用推荐值')}
	                    </button>
	                  </div>
	                </div>
	              </label>
              <label className={labelClassName()}>
                {t('admin.service_settings.reply_to_label', {}, 'Reply-to email')}
                <input className={fieldClassName()} value={emailForm.reply_to} disabled={loading} onChange={(event) => setEmailForm((current) => ({ ...current, reply_to: event.target.value }))} />
              </label>
              <label className={labelClassName()}>
                {t('admin.service_settings.timeout_seconds_label', {}, 'Timeout (seconds)')}
                <input className={fieldClassName()} value={emailForm.smtp_timeout_seconds} disabled={loading} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_timeout_seconds: event.target.value }))} />
              </label>
              <div className="flex flex-wrap items-center gap-5 text-sm text-slate-700 dark:text-slate-200">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className={checkboxClassName()} checked={emailForm.smtp_use_ssl} disabled={loading} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_use_ssl: event.target.checked, smtp_use_starttls: event.target.checked ? false : current.smtp_use_starttls }))} />
                  SSL
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className={checkboxClassName()} checked={emailForm.smtp_use_starttls} disabled={loading} onChange={(event) => setEmailForm((current) => ({ ...current, smtp_use_starttls: event.target.checked, smtp_use_ssl: event.target.checked ? false : current.smtp_use_ssl }))} />
                  STARTTLS
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className={checkboxClassName()} checked={emailForm.enabled} disabled={loading} onChange={(event) => setEmailForm((current) => ({ ...current, enabled: event.target.checked }))} />
                  {t('admin.service_settings.enabled_label', {}, 'Enabled')}
                </label>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="btn btn-primary" disabled={saving === 'email' || !activeGroupDirty || activeValidationIssues.length > 0}>
                  {saving === 'email'
                    ? t('admin.service_settings.saving', {}, 'Saving')
                    : t('common.save', {}, 'Save')}
                </button>
              </div>
            </form>
              ) : null}
            </section>

            <section className="grid gap-3 border-t border-slate-200 pt-6 dark:border-slate-800 lg:grid-cols-[1fr_auto]">
              <label className={labelClassName()}>
                {t('admin.service_settings.test_recipient_label', {}, 'Test recipient')}
                <input className={fieldClassName()} value={emailTestRecipient} onChange={(event) => setEmailTestRecipient(event.target.value)} placeholder="operator@example.com" />
              </label>
              <div className="flex flex-wrap items-end justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving === 'email-test' || !emailTestRecipient || activeGroupDirty || activeValidationIssues.length > 0}
                  onClick={() => postJson('/api/admin/service-settings/email/test', { recipient_email: emailTestRecipient }, 'email-test', t('admin.service_settings.email_test_sent', {}, 'Test email sent.'))}
                >
                  {t('admin.service_settings.send_test_email', {}, 'Send test email')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={openEmailPreviewDrawer}
                >
                  {t('admin.service_settings.email_preview_open', {}, '预览邮件模板')}
                </button>
              </div>
            </section>
          </div>
      ) : null}

      <AdminWorkbenchDialog
        open={emailPreviewOpen}
        title={t('admin.service_settings.email_preview_title', {}, 'Preview email')}
        titleId="email-preview-drawer-title"
        headerAccessory={(
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">
            {t(
              'admin.service_settings.email_preview_desc',
              {},
              'Uses the real backend template for preview only; it does not send email or save settings.'
            )}
          </span>
        )}
        saving={false}
        closeLabel={t('common.close', {}, 'Close')}
        cancelLabel={t('common.cancel', {}, 'Cancel')}
        saveLabel={t('admin.service_settings.email_preview_refresh', {}, 'Generate preview')}
        savingLabel={t('admin.service_settings.email_preview_loading', {}, 'Generating')}
        footerNotice={t(
          'admin.service_settings.email_preview_desc',
          {},
          'Uses the real backend template for preview only; it does not send email or save settings.'
        )}
        footerActions={(
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={saving === 'email-preview'}
              onClick={() => void loadEmailPreview()}
            >
              {saving === 'email-preview'
                ? t('admin.service_settings.email_preview_loading', {}, 'Generating')
                : t('admin.service_settings.email_preview_refresh', {}, 'Generate preview')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setEmailPreviewOpen(false)}
            >
              {t('admin.service_settings.email_preview_close', {}, 'Close preview')}
            </button>
          </div>
        )}
        density="compact"
        contentMode="contained"
        onClose={() => setEmailPreviewOpen(false)}
        onSubmit={() => void loadEmailPreview()}
      >
            <div data-ui="email-preview-workspace-scroll" className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid-cols-[16rem_1fr] lg:overflow-hidden">
              <aside data-ui="email-preview-settings-scroll" className="space-y-3 border-b border-slate-200 pr-4 dark:border-slate-800 lg:overflow-auto lg:border-b-0 lg:border-r">
                <label className={labelClassName()}>
                  {t('admin.service_settings.email_preview_type_label', {}, '邮件类型')}
                  <select
                    className={fieldClassName()}
                    value={emailPreviewType}
                    disabled={saving === 'email-preview'}
                    onChange={(event) => {
                      const nextType = event.target.value as EmailPreviewType;
                      setEmailPreviewType(nextType);
                      void loadEmailPreview(nextType);
                    }}
                  >
                    {emailPreviewOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    {t('admin.service_settings.email_preview_inbox_label', {}, 'Inbox header')}
                  </p>
                  <dl className="mt-3 space-y-2">
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">
                        {t('admin.service_settings.email_preview_from', {}, 'From')}
                      </dt>
                      <dd className="break-all font-medium text-slate-900 dark:text-slate-100">
                        {emailPreview
                          ? `${emailPreview.from_name} <${emailPreview.from_email}>`
                          : `${emailForm.from_name || 'Npcink AI Cloud'} <${emailForm.from_email || 'auth@npc.ink'}>`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">
                        {t('admin.service_settings.email_preview_subject', {}, 'Subject')}
                      </dt>
                      <dd className="break-words font-medium text-slate-900 dark:text-slate-100">
                        {emailPreview?.subject || t(
                          'admin.service_settings.email_preview_not_loaded',
                          {},
                          '点击生成预览后显示主题'
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </aside>

              <div className="flex min-h-[24rem] flex-col overflow-hidden pl-4 lg:min-h-0">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white pb-2 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {emailPreviewMode === 'html'
                      ? t('admin.service_settings.email_preview_html', {}, 'HTML 预览')
                      : t('admin.service_settings.email_preview_text', {}, '文本预览')}
                  </div>
                  <div className="inline-flex border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <button
                      type="button"
                      className={`rounded-md px-2 py-1 ${emailPreviewMode === 'html' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                      onClick={() => setEmailPreviewMode('html')}
                    >
                      HTML
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2 py-1 ${emailPreviewMode === 'text' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                      onClick={() => setEmailPreviewMode('text')}
                    >
                      Text
                    </button>
                  </div>
                </div>
                {emailPreview ? (
                  emailPreviewMode === 'html' ? (
                    <iframe
                      title={t('admin.service_settings.email_preview_iframe_title', {}, 'Email HTML preview')}
                      sandbox=""
                      className="min-h-0 flex-1 bg-white"
                      srcDoc={emailPreview.html}
                    />
                  ) : (
                    <pre data-ui="email-preview-content-scroll" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-white p-5 text-sm leading-6 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
                      {emailPreview.text}
                    </pre>
                  )
                ) : (
                  <div className="flex min-h-[24rem] flex-1 items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t(
                      'admin.service_settings.email_preview_empty',
                      {},
                      '选择邮件类型并生成预览，确认收件箱显示、主题和正文是否合适。'
                    )}
                  </div>
                )}
              </div>
            </div>
      </AdminWorkbenchDialog>

      {activeTab === 'payment' ? (
          <div id="service-settings-payment" className="space-y-4" role="tabpanel">
            <section className="space-y-4">
              <div className="flex min-w-0 items-baseline gap-3">
                <h2 className="shrink-0 text-base font-semibold text-slate-950 dark:text-white">
                  {t('admin.service_settings.alipay_title', {}, '支付宝支付')}
                </h2>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {t('admin.service_settings.alipay_desc', {}, '保存支付宝网页支付所需凭证。密钥加密存储，不会在页面回显。')}
                </p>
              </div>

              {activeStateNotice}

              <div
                data-ui="service-settings-high-risk"
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100"
              >
                <p className="font-semibold">
                  {t('admin.service_settings.payment_high_risk_title', {}, 'High-risk payment configuration')}
                </p>
                <p className="mt-1 leading-6">
                  {t('admin.service_settings.payment_high_risk_desc', {}, 'Changing application keys or callback identity can interrupt payment confirmation. Save first, run the configuration check, and treat the server notify callback as the payment truth.')}
                </p>
              </div>

              <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => void submitAlipay(event)}>
                <label className={labelClassName()}>
                  App ID
                  <input
                    className={fieldClassName()}
                    value={alipayForm.app_id}
                    disabled={loading}
                    onChange={(event) => setAlipayForm((current) => ({ ...current, app_id: event.target.value }))}
                  />
                </label>
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/60 lg:col-span-2">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-medium text-slate-700 dark:text-slate-200">
                      {t('admin.service_settings.alipay_callback_urls_title', {}, '支付宝支付回调地址')}
                    </h3>
                    <p className="font-mono text-xs text-slate-600 dark:text-slate-300">
                      {t('admin.service_settings.alipay_callback_base_label', {}, '回调基础地址')}: {effectivePortalPublicBaseUrl || t('admin.service_settings.alipay_callback_base_missing', {}, '尚未设置')}
                    </p>
                  </div>
                  <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {t('admin.service_settings.alipay_callback_console_guidance', {}, '这两个地址会随每笔网页支付请求发送给支付宝，不需要填写支付宝开放平台的“授权回调地址”。如控制台单独要求“异步通知地址”，请填左侧地址；“同步跳转地址”才填右侧地址。')}
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {portalPublicAutosavePending
                        ? t('admin.service_settings.alipay_public_url_autosave_notice', { baseUrl: browserPublicBaseUrl }, '保存支付宝配置时会先保存当前访问地址 {{baseUrl}}，再自动生成 notify_url 和 return_url。')
                        : t('admin.service_settings.alipay_callback_base_ready', {}, 'notify_url 和 return_url 会从这个地址自动生成。')}
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className={labelClassName()}>
                        <span>{t('admin.service_settings.alipay_notify_url_label', {}, '异步通知地址')}</span>
                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                          {t('admin.service_settings.alipay_notify_url_hint', {}, '支付宝服务端通知支付结果；这是唯一的支付确认依据。')}
                        </span>
                        <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <input
                            className={fieldClassName()}
                            value={resolvedAlipayNotifyUrl}
                            readOnly
                            disabled={loading}
                            placeholder={t('admin.service_settings.alipay_url_placeholder', {}, '保存门户基础地址后自动生成')}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={!resolvedAlipayNotifyUrl}
                            onClick={() => void copyText(resolvedAlipayNotifyUrl, t('admin.service_settings.alipay_notify_copied', {}, '支付宝异步通知地址已复制。'))}
                          >
                            {t('common.copy', {}, 'Copy')}
                          </button>
                        </div>
                      </div>
                      <div className={labelClassName()}>
                        <span>{t('admin.service_settings.alipay_return_url_label', {}, '同步返回地址')}</span>
                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                          {t('admin.service_settings.alipay_return_url_hint', {}, '用户支付后返回 Portal；只用于页面提示，不代表支付成功。')}
                        </span>
                        <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <input
                            className={fieldClassName()}
                            value={resolvedAlipayReturnUrl}
                            readOnly
                            disabled={loading}
                            placeholder={t('admin.service_settings.alipay_url_placeholder', {}, '保存门户基础地址后自动生成')}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={!resolvedAlipayReturnUrl}
                            onClick={() => void copyText(resolvedAlipayReturnUrl, t('admin.service_settings.alipay_return_copied', {}, '支付宝同步返回地址已复制。'))}
                          >
                            {t('common.copy', {}, 'Copy')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <AdminCredentialField
                  mode={secretConfigured.alipayPrivateKey ? 'edit' : 'create'}
                  revealed={alipayPrivateKeyRevealed}
                  value={alipayForm.private_key}
                  label={`${t('admin.service_settings.alipay_private_key_label', {}, 'Application private key')} ${secretConfigured.alipayPrivateKey
                    ? t('admin.service_settings.secret_configured_suffix', {}, '(configured)')
                    : t('admin.service_settings.secret_missing_suffix', {}, '(not configured)')}`}
                  unchangedLabel={t('admin.service_settings.credential_unchanged', {}, 'Current saved credential remains unchanged')}
                  replaceLabel={t('admin.service_settings.replace_credential', {}, 'Replace credential')}
                  cancelReplacementLabel={t('admin.service_settings.cancel_credential_replacement', {}, 'Cancel replacement')}
                  keepCurrentPlaceholder={t('admin.service_settings.secret_keep_placeholder', {}, 'Leave empty to keep the current key')}
                  density="compact"
                  multiline
                  onChange={(value) => setAlipayForm((current) => ({ ...current, private_key: value }))}
                  onReveal={() => setAlipayPrivateKeyRevealed(true)}
                  onCancelReplacement={() => {
                    setAlipayPrivateKeyRevealed(false);
                    setAlipayForm((current) => ({ ...current, private_key: '' }));
                  }}
                />
                <AdminCredentialField
                  mode={secretConfigured.alipayPublicKey ? 'edit' : 'create'}
                  revealed={alipayPublicKeyRevealed}
                  value={alipayForm.public_key}
                  label={`${t('admin.service_settings.alipay_public_key_label', {}, 'Alipay public key')} ${secretConfigured.alipayPublicKey
                    ? t('admin.service_settings.secret_configured_suffix', {}, '(configured)')
                    : t('admin.service_settings.secret_missing_suffix', {}, '(not configured)')}`}
                  unchangedLabel={t('admin.service_settings.credential_unchanged', {}, 'Current saved credential remains unchanged')}
                  replaceLabel={t('admin.service_settings.replace_credential', {}, 'Replace credential')}
                  cancelReplacementLabel={t('admin.service_settings.cancel_credential_replacement', {}, 'Cancel replacement')}
                  keepCurrentPlaceholder={t('admin.service_settings.secret_keep_placeholder', {}, 'Leave empty to keep the current key')}
                  density="compact"
                  multiline
                  onChange={(value) => setAlipayForm((current) => ({ ...current, public_key: value }))}
                  onReveal={() => setAlipayPublicKeyRevealed(true)}
                  onCancelReplacement={() => {
                    setAlipayPublicKeyRevealed(false);
                    setAlipayForm((current) => ({ ...current, public_key: '' }));
                  }}
                />

                <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <button
                      type="button"
                      role="switch"
                      aria-label={t('admin.service_settings.alipay_toggle_label', {}, '启用支付宝支付')}
                      aria-checked={alipayForm.enabled}
                      className={switchButtonClassName(alipayForm.enabled)}
                      disabled={loading}
                      onClick={() => setAlipayForm((current) => ({ ...current, enabled: !current.enabled }))}
                    >
                      <span className={switchKnobClassName(alipayForm.enabled)} />
                    </button>
                    {t('admin.service_settings.alipay_enabled_label', {}, '启用支付宝支付')}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={saving === 'alipay-test' || activeGroupDirty || activeValidationIssues.length > 0}
                      onClick={() => postJson('/api/admin/service-settings/alipay-payment/test', {}, 'alipay-test', t('admin.service_settings.alipay_test_done', {}, '支付宝配置检查完成。'))}
                    >
                      {saving === 'alipay-test'
                        ? t('admin.service_settings.checking', {}, 'Checking')
                        : t('admin.service_settings.check_alipay', {}, '检查支付宝配置')}
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving === 'alipay-payment' || !activeGroupDirty || activeValidationIssues.length > 0}>
                      {saving === 'alipay-payment'
                        ? t('admin.service_settings.saving', {}, 'Saving')
                        : t('admin.service_settings.save_alipay', {}, '保存支付宝配置')}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </div>
      ) : null}

      </AdminSettingsWorkbench>

      <ConfirmModal
        isOpen={pendingTab !== null}
        title={t('admin.service_settings.unsaved_switch_title', {}, 'Discard unsaved changes?')}
        message={t(
          'admin.service_settings.unsaved_switch_desc',
          {},
          'Opening another configuration group will discard the edits in this group. Saved settings are not affected.'
        )}
        confirmLabel={t('admin.service_settings.discard_and_switch', {}, 'Discard and switch')}
        cancelLabel={t('common.cancel', {}, 'Cancel')}
        variant="danger"
        onClose={() => setPendingTab(null)}
        onConfirm={() => {
          const nextTab = pendingTab;
          restoreActiveGroup();
          setPendingTab(null);
          if (nextTab) {
            setActiveTab(nextTab);
          }
        }}
      />

      <ConfirmModal
        isOpen={Boolean(pendingNavigationHref)}
        title={t('admin.service_settings.unsaved_leave_title', {}, 'Leave with unsaved changes?')}
        message={t(
          'admin.service_settings.unsaved_leave_desc',
          {},
          'Leaving this page will discard the edits in the current group. Saved service settings are not affected.'
        )}
        confirmLabel={t('admin.service_settings.discard_and_leave', {}, 'Discard and leave')}
        cancelLabel={t('common.cancel', {}, 'Cancel')}
        variant="danger"
        onClose={() => setPendingNavigationHref('')}
        onConfirm={() => {
          const href = pendingNavigationHref;
          restoreActiveGroup();
          setPendingNavigationHref('');
          if (href) router.push(href);
        }}
      />
    </BackofficePageStack>
  );
}
