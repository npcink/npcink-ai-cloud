'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminConfigurationRow,
  AdminConfigurationTable,
} from '@/components/admin/AdminConfigurationTable';
import { AdminCredentialField } from '@/components/admin/AdminCredentialField';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminRouteSkeleton } from '@/components/admin/AdminRouteSkeleton';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import {
  BackofficeDiagnosticNotice,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeSummaryStrip,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';

type ServiceCategory = 'search' | 'image';

const externalServicesClient = createApiClient({ idempotencyPrefix: 'external_services' });

type ProviderConnection = {
  connection_id: string;
  provider_id: string;
  provider_type: string;
  kind: string;
  display_name: string;
  enabled: boolean;
  configured: boolean;
  status: string;
  base_url: string;
  source_role: string;
  capability_ids: string[];
  runtime_profile_ids: string[];
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type ServiceOption = {
  id: string;
  category: ServiceCategory;
  label: string;
  description: string;
  descriptionZh: string;
  kind: 'web_search_provider' | 'image_source_provider';
  baseUrl: string;
  capabilityIds: string[];
  runtimeProfileIds: string[];
  role: 'primary' | 'enhancer' | 'parallel';
  secretless?: boolean;
};

type RowFeedback = {
  tone: 'success' | 'error';
  message: string;
};

const SERVICE_OPTIONS: ServiceOption[] = [
  { id: 'tavily', category: 'search', label: 'Tavily', description: 'Primary general web search.', descriptionZh: '通用网页搜索主服务。', kind: 'web_search_provider', baseUrl: 'https://api.tavily.com', capabilityIds: ['web_search'], runtimeProfileIds: ['web-search.managed'], role: 'primary' },
  { id: 'bocha', category: 'search', label: 'Bocha', description: 'Primary search service for Chinese and public sources.', descriptionZh: '面向中文和公开来源的主搜索服务。', kind: 'web_search_provider', baseUrl: 'https://api.bochaai.com/v1', capabilityIds: ['web_search'], runtimeProfileIds: ['web-search.managed'], role: 'primary' },
  { id: 'apify', category: 'search', label: 'Apify', description: 'Primary actor-backed search service.', descriptionZh: '基于 Actor 的主搜索服务。', kind: 'web_search_provider', baseUrl: 'https://api.apify.com/v2', capabilityIds: ['web_search'], runtimeProfileIds: ['web-search.managed'], role: 'primary' },
  { id: 'zhihu', category: 'search', label: 'Zhihu Search', description: 'Primary Zhihu Open Platform search.', descriptionZh: '知乎开放平台主搜索服务。', kind: 'web_search_provider', baseUrl: 'https://developer.zhihu.com', capabilityIds: ['web_search'], runtimeProfileIds: ['web-search.managed'], role: 'primary' },
  { id: 'jina_reader', category: 'search', label: 'Jina Reader', description: 'Optional result-page reader enhancement; it is not a primary search service.', descriptionZh: '可选的结果页读取增强，不作为主搜索服务。', kind: 'web_search_provider', baseUrl: 'https://r.jina.ai', capabilityIds: ['web_search'], runtimeProfileIds: ['web-search.reader'], role: 'enhancer', secretless: true },
  { id: 'unsplash', category: 'image', label: 'Unsplash', description: 'Stock image source used in parallel with other enabled sources.', descriptionZh: '可与其他已启用来源并行使用的图库。', kind: 'image_source_provider', baseUrl: 'https://api.unsplash.com', capabilityIds: ['image_source'], runtimeProfileIds: ['image-source.managed'], role: 'parallel' },
  { id: 'pixabay', category: 'image', label: 'Pixabay', description: 'Stock image source used in parallel with other enabled sources.', descriptionZh: '可与其他已启用来源并行使用的图库。', kind: 'image_source_provider', baseUrl: 'https://pixabay.com/api', capabilityIds: ['image_source'], runtimeProfileIds: ['image-source.managed'], role: 'parallel' },
  { id: 'pexels', category: 'image', label: 'Pexels', description: 'Stock image source used in parallel with other enabled sources.', descriptionZh: '可与其他已启用来源并行使用的图库。', kind: 'image_source_provider', baseUrl: 'https://api.pexels.com/v1', capabilityIds: ['image_source'], runtimeProfileIds: ['image-source.managed'], role: 'parallel' },
];

function connectionFor(option: ServiceOption, connections: ProviderConnection[]) {
  return connections.find((connection) => connection.kind === option.kind && connection.provider_id === option.id);
}

export default function ExternalServicesPage() {
  const { locale, t } = useLocale();
  const zh = locale.startsWith('zh');
  const copy = useCallback((key: string, zhText: string, enText: string) => t(key, {}, zh ? zhText : enText), [t, zh]);
  const [category, setCategory] = useState<ServiceCategory>('search');
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<Record<string, RowFeedback>>({});
  const [editingId, setEditingId] = useState('');
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftCredential, setDraftCredential] = useState('');
  const [credentialRevealed, setCredentialRevealed] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const loadConnections = useCallback(async () => {
    setError('');
    try {
      const response = await externalServicesClient.request<{ connections?: ProviderConnection[] }>(
        '/api/admin/provider-connections'
      );
      setConnections(Array.isArray(response.data.connections) ? response.data.connections : []);
    } catch (loadError) {
      setError(resolveUiErrorMessage(loadError, copy('admin.external_services.load_error', '加载外部服务失败。', 'Failed to load external services.')));
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => { void loadConnections(); }, [loadConnections]);

  const visibleOptions = useMemo(() => SERVICE_OPTIONS.filter((option) => option.category === category), [category]);
  const editingOption = SERVICE_OPTIONS.find((option) => option.id === editingId);
  const editingConnection = editingOption ? connectionFor(editingOption, connections) : undefined;
  const editorDirty = Boolean(
    editingOption
    && (draftEnabled !== Boolean(editingConnection?.enabled) || draftCredential)
  );
  const readyCount = SERVICE_OPTIONS.filter((option) => {
    const connection = connectionFor(option, connections);
    return Boolean(connection?.enabled && (connection.configured || option.secretless));
  }).length;

  function setRowFeedback(optionId: string, next: RowFeedback) {
    setFeedback((current) => ({ ...current, [optionId]: next }));
  }

  function openEditor(option: ServiceOption) {
    const connection = connectionFor(option, connections);
    setEditingId(option.id);
    setDraftEnabled(Boolean(connection?.enabled));
    setDraftCredential('');
    setCredentialRevealed(false);
    setDialogError('');
    setConfirmingClear(false);
  }

  function closeEditor() {
    if (busy) return;
    if (editorDirty && !window.confirm(copy(
      'admin.external_services.discard_confirm',
      '当前服务有未保存的修改，确认放弃？',
      'This service has unsaved changes. Discard them?'
    ))) return;
    setEditingId('');
    setDraftCredential('');
    setCredentialRevealed(false);
    setDialogError('');
    setConfirmingClear(false);
  }

  async function saveOption(option: ServiceOption, enabled: boolean, clearCredential = false) {
    const existing = connectionFor(option, connections);
    const credential = clearCredential ? '' : draftCredential || undefined;
    if (enabled && !option.secretless && !credential && !existing?.configured) {
      setDialogError(copy('admin.external_services.credential_required', '启用前请填写 API Key 或 Token。', 'Enter an API key or token before enabling this service.'));
      return;
    }
    setBusy(`${clearCredential ? 'clear' : 'save'}:${option.id}`);
    setDialogError('');
    try {
      await externalServicesClient.request<unknown>(
        existing ? `/api/admin/provider-connections/${encodeURIComponent(existing.connection_id)}` : '/api/admin/provider-connections',
        {
          method: existing ? 'PATCH' : 'POST',
          body: {
            connection_id: existing?.connection_id || `external_${option.id}`,
            provider_id: option.id,
            provider_type: option.kind,
            kind: option.kind,
            display_name: option.label,
            enabled: clearCredential ? false : enabled,
            base_url: option.baseUrl,
            source_role: option.role === 'enhancer' ? 'reader_enhancement' : 'execution_source',
            capability_ids: option.capabilityIds,
            runtime_profile_ids: option.runtimeProfileIds,
            config: { ...(existing?.config || {}), secretless: Boolean(option.secretless) },
            metadata: { ui_source: 'external_services', service_role: option.role },
            secretless: Boolean(option.secretless),
            credential,
          },
        }
      );
      setRowFeedback(option.id, {
        tone: 'success',
        message: clearCredential
          ? copy('admin.external_services.cleared', '凭据已清除，服务已停用。', 'Credential cleared and service disabled.')
          : copy('admin.external_services.saved', '外部服务设置已保存。', 'External service settings saved.'),
      });
      await loadConnections();
      setEditingId('');
      setDraftCredential('');
      setCredentialRevealed(false);
      setConfirmingClear(false);
    } catch (saveError) {
      setDialogError(resolveUiErrorMessage(saveError, copy('admin.external_services.save_error', '保存外部服务失败。', 'Failed to save external service.')));
    } finally {
      setBusy('');
    }
  }

  async function testOption(option: ServiceOption) {
    const connection = connectionFor(option, connections);
    if (!connection) return;
    setBusy(`test:${option.id}`);
    setRowFeedback(option.id, { tone: 'success', message: copy('common.testing', '测试中…', 'Testing…') });
    try {
      await externalServicesClient.request<unknown>(
        `/api/admin/provider-connections/${encodeURIComponent(connection.connection_id)}/test`,
        { method: 'POST' }
      );
      setRowFeedback(option.id, {
        tone: 'success',
        message: copy('admin.external_services.test_passed', '连接测试通过。', 'Connection test passed.'),
      });
      await loadConnections();
    } catch (testError) {
      setRowFeedback(option.id, {
        tone: 'error',
        message: resolveUiErrorMessage(testError, copy('admin.external_services.test_error', '连接测试失败。', 'Connection test failed.')),
      });
    } finally {
      setBusy('');
    }
  }

  if (loading) return <AdminRouteSkeleton />;

  return (
    <BackofficePageStack data-page-model="configuration" data-external-services-page>
      <BackofficePrimaryPanel
        eyebrow={copy('admin.external_services.eyebrow', '运行设置', 'Runtime settings')}
        title={copy('admin.external_services.title', '搜索与图片', 'Search & images')}
        description={copy('admin.external_services.description', '从固定服务清单配置网页搜索和图库来源，无需创建供应商记录。', 'Configure web search and stock-image sources from a fixed service directory; no supplier records need to be created.')}
        actions={<Link href="/admin/troubleshooting" className="btn btn-secondary">{copy('admin.external_services.open_diagnostics', '查看运行诊断', 'Open runtime diagnostics')}</Link>}
        summary={<BackofficeSummaryStrip items={[
          { label: copy('admin.external_services.ready', '已就绪服务', 'Ready services'), value: `${readyCount}/${SERVICE_OPTIONS.length}` },
          { label: copy('admin.external_services.search_rule', '搜索规则', 'Search rule'), value: copy('admin.external_services.search_rule_value', '主服务单选 + Reader 增强', 'One primary + Reader enhancement') },
          { label: copy('admin.external_services.image_rule', '图片规则', 'Image rule'), value: copy('admin.external_services.image_rule_value', '已启用来源并行', 'Enabled sources in parallel') },
        ]} />}
      />

      {error ? <BackofficeDiagnosticNotice message={error} retryLabel={copy('common.retry', '重试', 'Retry')} onRetry={() => void loadConnections()} /> : null}

      <BackofficeSectionPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={copy('admin.external_services.categories', '服务类型', 'Service category')}>
            {(['search', 'image'] as ServiceCategory[]).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={category === value} className={category === value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setCategory(value)}>
                {value === 'search' ? copy('admin.external_services.search', '网页搜索', 'Web search') : copy('admin.external_services.images', '图库来源', 'Image sources')}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {copy('admin.external_services.table_hint', '先看状态，再配置或测试单个服务。', 'Scan status first, then configure or test one service.')}
          </span>
        </div>

        <div data-external-category={category}>
          <AdminDataTableFrame
            dataUi="external-service-directory"
            title={category === 'search'
              ? copy('admin.external_services.search_directory', '网页搜索服务', 'Web search services')
              : copy('admin.external_services.image_directory', '图库来源', 'Image sources')}
            resultLabel={copy('admin.external_services.result_count', `${visibleOptions.length} 项服务`, `${visibleOptions.length} services`)}
            footer={(
              <details data-ui="external-service-boundary" className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">
                  {copy('admin.external_services.boundary_title', '运行边界', 'Runtime boundary')}
                </summary>
                <p className="mt-2 max-w-3xl leading-5">
                  {copy('admin.external_services.boundary', '这里只配置 Cloud 运行时外部服务，不定义 WordPress 能力、工作流或写入权限。', 'This page configures Cloud runtime services only; it does not define WordPress abilities, workflows, or write authority.')}
                </p>
              </details>
            )}
          >
            <table data-ui="external-service-table" className="w-full min-w-[58rem] table-fixed text-left text-sm">
              <thead className="border-b border-slate-200 bg-white text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="w-[22%] px-4 py-2.5">{copy('admin.external_services.column_service', '服务', 'Service')}</th>
                  <th className="w-[18%] px-3 py-2.5">{copy('admin.external_services.column_role', '角色', 'Role')}</th>
                  <th className="w-[14%] px-3 py-2.5">{copy('admin.external_services.column_status', '状态', 'Status')}</th>
                  <th className="w-[15%] px-3 py-2.5">{copy('admin.external_services.column_credential', '凭据', 'Credential')}</th>
                  <th className="w-[12%] px-3 py-2.5">{copy('admin.external_services.column_runtime', '运行调用', 'Runtime')}</th>
                  <th className="w-[19%] px-4 py-2.5 text-right">{copy('admin.external_services.column_actions', '操作', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleOptions.map((option) => {
                  const connection = connectionFor(option, connections);
                  const enabled = Boolean(connection?.enabled);
                  const ready = enabled && Boolean(connection?.configured || option.secretless);
                  const rowFeedback = feedback[option.id];
                  return (
                    <React.Fragment key={option.id}>
                      <tr data-external-service-id={option.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                        <td className="px-4 py-3 align-top">
                          <button type="button" className="font-semibold text-slate-950 hover:text-blue-700 dark:text-white dark:hover:text-blue-300" onClick={() => openEditor(option)}>
                            {option.label}
                          </button>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{option.baseUrl}</p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {option.role === 'primary'
                              ? copy('admin.external_services.role_primary', '主搜索', 'Primary search')
                              : option.role === 'enhancer'
                                ? copy('admin.external_services.role_enhancer', 'Reader 增强', 'Reader enhancement')
                                : copy('admin.external_services.role_parallel', '并行来源', 'Parallel source')}
                          </span>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{zh ? option.descriptionZh : option.description}</p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <BackofficeStatusBadge
                            label={ready
                              ? copy('common.ready', '已就绪', 'Ready')
                              : enabled
                                ? copy('common.missing_config', '缺少凭据', 'Missing credential')
                                : copy('common.disabled', '已停用', 'Disabled')}
                            status={ready ? 'success' : enabled ? 'warning' : 'neutral'}
                          />
                        </td>
                        <td className="px-3 py-3 align-top text-slate-600 dark:text-slate-300">
                          {option.secretless
                            ? copy('admin.external_services.no_credential', '无需凭据', 'Not required')
                            : connection?.configured
                              ? copy('admin.external_services.credential_saved', '已保存', 'Saved')
                              : copy('admin.external_services.credential_missing', '未配置', 'Missing')}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-600 dark:text-slate-300">
                          {enabled ? copy('common.enabled', '已启用', 'Enabled') : copy('common.disabled', '已停用', 'Disabled')}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            {connection?.configured || option.secretless ? (
                              <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== '' || !connection} onClick={() => void testOption(option)}>
                                {busy === `test:${option.id}` ? copy('common.testing', '测试中…', 'Testing…') : copy('common.test_connection', '测试', 'Test')}
                              </button>
                            ) : null}
                            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={() => openEditor(option)}>
                              {copy('common.configure', '配置', 'Configure')}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {rowFeedback ? (
                        <tr data-external-service-feedback={option.id}>
                          <td colSpan={6} className={`px-4 py-2 text-xs ${rowFeedback.tone === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300'}`} role={rowFeedback.tone === 'error' ? 'alert' : 'status'}>
                            {rowFeedback.message}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </AdminDataTableFrame>
        </div>
      </BackofficeSectionPanel>

      <AdminWorkbenchDialog
        open={Boolean(editingOption)}
        title={editingOption ? copy('admin.external_services.edit_title', `配置 ${editingOption.label}`, `Configure ${editingOption.label}`) : ''}
        titleId="external-service-workbench-title"
        error={dialogError}
        saving={busy.startsWith('save:') || busy.startsWith('clear:')}
        closeLabel={copy('common.close', '关闭', 'Close')}
        cancelLabel={copy('common.cancel', '取消', 'Cancel')}
        saveLabel={copy('common.save', '保存设置', 'Save settings')}
        savingLabel={copy('common.saving', '保存中…', 'Saving…')}
        footerNotice={copy('admin.external_services.footer_notice', '保存后仅更新当前服务；连接测试需单独执行。', 'Saving updates this service only; connection tests run separately.')}
        hideFooterActions={confirmingClear}
        width="compact"
        onClose={closeEditor}
        onSubmit={() => { if (editingOption) void saveOption(editingOption, draftEnabled); }}
      >
        {editingOption ? (
          <AdminConfigurationTable
            ariaLabel={copy('admin.external_services.configuration_table', `${editingOption.label} 配置`, `${editingOption.label} configuration`)}
            itemHeading={copy('admin.external_services.configuration_item', '配置项', 'Setting')}
            valueHeading={copy('admin.external_services.current_value', '当前设置', 'Current setting')}
            detailHeading={copy('admin.external_services.action_or_note', '操作 / 说明', 'Action / note')}
          >
            <AdminConfigurationRow
              rowId="service-role"
              label={copy('admin.external_services.service_role', '服务角色', 'Service role')}
              value={editingOption.role === 'primary'
                ? copy('admin.external_services.role_primary', '主搜索', 'Primary search')
                : editingOption.role === 'enhancer'
                  ? copy('admin.external_services.role_enhancer', 'Reader 增强', 'Reader enhancement')
                  : copy('admin.external_services.role_parallel', '并行来源', 'Parallel source')}
              detail={editingOption.role === 'primary'
                ? copy('admin.external_services.primary_role', '启用后替换其他主搜索服务。', 'Enabling it replaces the other primary search service.')
                : editingOption.role === 'enhancer'
                  ? copy('admin.external_services.enhancer_role', '可与主搜索服务同时启用。', 'Can run alongside the primary search service.')
                  : copy('admin.external_services.parallel_role', '可与其他图库同时启用。', 'Can run alongside other image sources.')}
            />
            <AdminConfigurationRow
              rowId="service-url"
              label={copy('admin.external_services.service_url', '服务地址', 'Service URL')}
              value={<code className="break-all text-xs text-slate-700 dark:text-slate-200">{editingOption.baseUrl}</code>}
              detail={copy('admin.external_services.fixed_value', '系统固定', 'System fixed')}
            />
            <AdminConfigurationRow
              rowId="credential"
              label={copy('admin.external_services.credential', 'API Key / Token', 'API key / token')}
              value={!editingOption.secretless ? (
                <AdminCredentialField
                  mode={editingConnection?.configured ? 'edit' : 'create'}
                  revealed={credentialRevealed}
                  value={draftCredential}
                  label={copy('admin.external_services.credential', 'API Key / Token', 'API key / token')}
                  unchangedLabel={copy('admin.external_services.credential_unchanged', '保留当前已保存凭据', 'Current saved credential remains unchanged')}
                  replaceLabel={copy('admin.external_services.replace_credential', '替换凭据', 'Replace credential')}
                  cancelReplacementLabel={copy('admin.external_services.cancel_replace', '取消替换', 'Cancel replacement')}
                  keepCurrentPlaceholder={copy('admin.external_services.new_credential', '输入新凭据', 'Enter a new credential')}
                  density="compact"
                  hideLabel
                  onChange={setDraftCredential}
                  onReveal={() => setCredentialRevealed(true)}
                  onCancelReplacement={() => {
                    setCredentialRevealed(false);
                    setDraftCredential('');
                  }}
                />
              ) : copy('admin.external_services.no_credential', '无需凭据', 'Not required')}
              detail={editingOption.secretless
                ? copy('admin.external_services.secretless_notice', '可直接启用并保存。', 'Enable and save directly.')
                : editingConnection?.configured
                  ? copy('admin.external_services.credential_saved', '已保存，不会显示原值', 'Saved; the original value is never shown')
                  : copy('admin.external_services.credential_missing', '尚未配置', 'Not configured')}
            />
            <AdminConfigurationRow
              rowId="runtime-enabled"
              label={copy('admin.external_services.enable_runtime', '运行调用', 'Runtime calls')}
              value={draftEnabled ? copy('common.enabled', '已启用', 'Enabled') : copy('common.disabled', '已停用', 'Disabled')}
              detail={(
                <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={draftEnabled} disabled={busy !== ''} onChange={(event) => setDraftEnabled(event.target.checked)} />
                  {copy('admin.external_services.enable_runtime_action', '启用于运行时调用', 'Enable for runtime calls')}
                </label>
              )}
            />
            {editingConnection?.configured && !editingOption.secretless ? (
              <AdminConfigurationRow
                rowId="credential-clear"
                label={copy('admin.external_services.credential_action', '凭据操作', 'Credential action')}
                value={confirmingClear
                  ? copy('admin.external_services.clear_confirm', `确认清除 ${editingOption.label} 的凭据并立即停用该服务？`, `Clear the credential for ${editingOption.label} and disable this service now?`)
                  : copy('admin.external_services.clear_effect', '清除凭据后立即停用服务', 'Clearing the credential disables the service immediately')}
                detail={!confirmingClear ? (
                  <button type="button" className="font-semibold text-rose-700 hover:underline dark:text-rose-300" onClick={() => setConfirmingClear(true)}>
                    {copy('admin.external_services.clear_credential', '清除凭据并停用', 'Clear credential and disable')}
                  </button>
                ) : (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmingClear(false)}>
                      {copy('common.cancel', '取消', 'Cancel')}
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" disabled={busy !== ''} onClick={() => void saveOption(editingOption, false, true)}>
                      {busy === `clear:${editingOption.id}` ? copy('common.saving', '处理中…', 'Working…') : copy('admin.external_services.confirm_clear', '确认清除并停用', 'Clear and disable')}
                    </button>
                  </div>
                )}
              />
            ) : null}
          </AdminConfigurationTable>
        ) : null}
      </AdminWorkbenchDialog>
    </BackofficePageStack>
  );
}
