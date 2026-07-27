'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackofficeDiagnosticNotice,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeSummaryStrip
} from '@/components/backoffice/BackofficeScaffold';
import {
  AdminConfigurationRow,
  AdminConfigurationTable
} from '@/components/admin/AdminConfigurationTable';
import { AdminCredentialField } from '@/components/admin/AdminCredentialField';
import { AdminRouteSkeleton } from '@/components/admin/AdminRouteSkeleton';
import { AdminSettingsDisclosure } from '@/components/admin/AdminSettingsDisclosure';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';

const vectorSettingsClient = createApiClient({
  idempotencyPrefix: 'vector_settings'
});

type VectorProfile = {
  profile_id: string;
  model_id: string;
  dimensions: number;
  metric: string;
  production_backend: string;
  local_test_backend: string;
  active_backend: string;
  status: string;
  editable_fields: string[];
  reindex_policy: string;
  provider: {
    provider_id: string;
    display_name: string;
    connection_id: string;
    configured: boolean;
    verified: boolean;
    status: string;
    last_tested_at: string;
  };
  vector_store: {
    provider_id: string;
    display_name: string;
    connection_id: string;
    configured: boolean;
    verified: boolean;
    status: string;
    settings_owner: string;
    endpoint: string;
    token_configured: boolean;
    collection: string;
    last_tested_at: string;
  };
  validation: {
    connection: {
      status: string;
      provider_verified: boolean;
      vector_store_verified: boolean;
    };
    index: {
      status: string;
      reason: string;
      embedding_space_id: string;
      source_document_count: number;
      source_chunk_count: number;
      indexed_chunk_count: number;
      roundtrip_status: string;
      last_reindexed_at: string;
      last_error_code: string;
    };
    retrieval: {
      status: string;
      last_verified_at: string;
      result_count: number;
      top1_score: number;
      evidence_source: string;
    };
  };
};

function formatBackend(value: string): string {
  if (value === 'zilliz_cloud') return 'Zilliz Cloud';
  if (value === 'postgres_json') return 'PostgreSQL JSON';
  return value || '—';
}

export default function VectorSettingsPage() {
  const { locale, t } = useLocale();
  const zh = locale.startsWith('zh');
  const copy = useCallback(
    (key: string, zhText: string, enText: string) => t(key, {}, zh ? zhText : enText),
    [t, zh]
  );
  const [profile, setProfile] = useState<VectorProfile | null>(null);
  const [credential, setCredential] = useState('');
  const [zillizEndpoint, setZillizEndpoint] = useState('');
  const [zillizToken, setZillizToken] = useState('');
  const [providerCredentialRevealed, setProviderCredentialRevealed] = useState(false);
  const [zillizTokenRevealed, setZillizTokenRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingVectorStore, setSavingVectorStore] = useState(false);
  const [savingConfiguration, setSavingConfiguration] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadProfile = useCallback(async () => {
    setError('');
    try {
      const response = await vectorSettingsClient.request<VectorProfile>(
        '/api/admin/site-knowledge-vector-profile'
      );
      const nextProfile = response.data;
      setProfile(nextProfile);
      setZillizEndpoint(nextProfile.vector_store.endpoint || '');
      setProviderCredentialRevealed(!nextProfile.provider.configured);
      setZillizTokenRevealed(!nextProfile.vector_store.token_configured);
    } catch (loadError) {
      setError(
        resolveUiErrorMessage(
          loadError,
          copy(
            'admin.vector_settings.load_error',
            '加载向量服务失败。',
            'Failed to load the vector service.'
          )
        )
      );
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);
  useEffect(() => {
    if (!['awaiting_site_sync', 'rebuilding'].includes(String(profile?.status || ''))) return;
    const timer = window.setInterval(() => {
      void loadProfile();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadProfile, profile?.status]);

  async function saveAndVerify() {
    if (!credential.trim() && !profile?.provider.configured)
      throw new Error('provider credential required');
    setSaving(true);
    const response = await vectorSettingsClient.request<VectorProfile>(
      '/api/admin/site-knowledge-vector-profile',
      { method: 'PUT', body: { credential: credential.trim() || null } }
    );
    setProfile(response.data);
    setCredential('');
    setProviderCredentialRevealed(false);
    setSaving(false);
  }

  async function saveAndVerifyVectorStore() {
    if (!zillizEndpoint.trim() || (!zillizToken.trim() && !profile?.vector_store.token_configured))
      throw new Error('vector store credentials required');
    setSavingVectorStore(true);
    const response = await vectorSettingsClient.request<VectorProfile>(
      '/api/admin/site-knowledge-vector-profile/vector-store',
      {
        method: 'PUT',
        body: {
          endpoint: zillizEndpoint.trim(),
          token: zillizToken.trim() || null
        }
      }
    );
    setProfile(response.data);
    setZillizEndpoint(response.data.vector_store.endpoint || zillizEndpoint.trim());
    setZillizToken('');
    setZillizTokenRevealed(false);
    setSavingVectorStore(false);
  }

  async function saveConfiguration() {
    if (!credential.trim() && !profile?.provider.configured) {
      setError(
        copy(
          'admin.vector_settings.credential_required',
          '请填写 SiliconFlow API Key。',
          'Enter the SiliconFlow API key.'
        )
      );
      return;
    }
    if (!zillizEndpoint.trim()) {
      setError(
        copy(
          'admin.vector_settings.zilliz_endpoint_required',
          '请填写 Zilliz Endpoint。',
          'Enter the Zilliz endpoint.'
        )
      );
      return;
    }
    if (!zillizToken.trim() && !profile?.vector_store.token_configured) {
      setError(
        copy(
          'admin.vector_settings.zilliz_token_required',
          '请填写 Zilliz Token。',
          'Enter the Zilliz token.'
        )
      );
      return;
    }
    setSavingConfiguration(true);
    setError('');
    setMessage('');
    try {
      await saveAndVerify();
      await saveAndVerifyVectorStore();
      setMessage(
        copy(
          'admin.vector_settings.configuration_saved',
          '配置已保存，并已完成当前固定档案的连接检测。',
          'Configuration saved and checked against the current fixed profile.'
        )
      );
    } catch (saveError) {
      const errorCode = saveError instanceof ApiError ? saveError.errorCode : '';
      const knownMessage =
        errorCode === 'site_knowledge_vector_profile.zilliz_endpoint_invalid'
          ? copy(
              'admin.vector_settings.zilliz_endpoint_invalid',
              'Endpoint 格式不正确，请粘贴 Zilliz 集群详情中的公共 Endpoint。',
              'The endpoint is invalid. Paste the public endpoint from the Zilliz cluster details.'
            )
          : errorCode === 'site_knowledge_vector_profile.zilliz_sdk_unavailable'
            ? copy(
                'admin.vector_settings.zilliz_sdk_unavailable',
                '当前 Cloud 服务缺少 Zilliz 运行组件，请联系部署管理员重建服务镜像后重试。',
                'This Cloud instance is missing the Zilliz runtime component. Ask the deployment operator to rebuild the service image, then retry.'
              )
            : errorCode === 'site_knowledge_vector_profile.zilliz_schema_incompatible'
              ? copy(
                  'admin.vector_settings.zilliz_schema_incompatible',
                  '固定 Collection 的结构、1024 维或 COSINE 索引不兼容，请更换空集群或删除冲突 Collection 后重试。',
                  'The fixed collection has an incompatible schema, dimension, or metric. Use an empty cluster or remove the conflicting collection before retrying.'
                )
              : errorCode === 'site_knowledge_vector_profile.zilliz_probe_failed'
                ? copy(
                    'admin.vector_settings.zilliz_probe_failed',
                    '无法连接 Zilliz，请检查公共 Endpoint、Token 权限和集群运行状态。',
                    'Could not connect to Zilliz. Check the public endpoint, token permissions, and cluster status.'
                  )
                : '';
      setError(
        knownMessage ||
          resolveUiErrorMessage(
            saveError,
            copy(
              'admin.vector_settings.save_error',
              '保存配置失败。',
              'Failed to save configuration.'
            )
          )
      );
    } finally {
      setSaving(false);
      setSavingVectorStore(false);
      setSavingConfiguration(false);
    }
  }

  async function rebuildIndex() {
    setRebuilding(true);
    setError('');
    setMessage('');
    try {
      const response = await vectorSettingsClient.request<VectorProfile>(
        '/api/admin/site-knowledge-vector-profile/index-rebuilds',
        {
          method: 'POST',
          body: { confirmation: 'rebuild_site_knowledge_index' }
        }
      );
      setProfile(response.data);
      setMessage(
        response.data.validation.index.status === 'awaiting_site_sync'
          ? copy(
              'admin.vector_settings.site_sync_requested',
              '已通知各站点在后台自动重送公开内容；无需站点管理员手动操作。',
              'Sites will automatically resend public content in the background. No site-admin action is required.'
            )
          : copy(
              'admin.vector_settings.rebuild_complete',
              'Zilliz 索引已重建并通过往返自检。请执行一次正常的站点知识搜索，完成真实检索验收。',
              'The Zilliz index was rebuilt and passed its round-trip check. Run a normal Site Knowledge search to complete retrieval validation.'
            )
      );
    } catch (rebuildError) {
      const errorCode = rebuildError instanceof ApiError ? rebuildError.errorCode : '';
      const knownMessage =
        errorCode === 'site_knowledge_vector_profile.embedding_space_mismatch'
          ? copy(
              'admin.vector_settings.embedding_space_mismatch',
              '现有资料来自旧向量来源，不能直接迁移。请从站点端执行一次全量 Site Knowledge 同步。',
              'Existing content belongs to an older vector source and cannot be copied. Run a full Site Knowledge sync from the site.'
            )
          : errorCode === 'site_knowledge_vector_profile.embedding_invalid' ||
              errorCode === 'site_knowledge_vector_profile.dimension_mismatch'
            ? copy(
                'admin.vector_settings.stored_embedding_invalid',
                '现有资料的向量不符合固定档案，请从站点端执行一次全量 Site Knowledge 同步。',
                'Existing vectors do not match the fixed profile. Run a full Site Knowledge sync from the site.'
              )
            : '';
      if (
        rebuildError instanceof ApiError &&
        rebuildError.statusCode > 0 &&
        !errorCode.startsWith('client.')
      )
        await loadProfile();
      setError(
        knownMessage ||
          resolveUiErrorMessage(
            rebuildError,
            copy(
              'admin.vector_settings.rebuild_error',
              '索引重建失败，请查看向量诊断后重试。',
              'Index rebuild failed. Review vector diagnostics and retry.'
            )
          )
      );
    } finally {
      setRebuilding(false);
    }
  }

  const status = useMemo(() => {
    const states: Record<
      string,
      {
        label: string;
        tone: 'success' | 'warning' | 'failed' | 'inactive';
        description: string;
      }
    > = {
      ready: {
        label: copy('admin.vector_settings.status_ready', '可用', 'Ready'),
        tone: 'success',
        description: copy(
          'admin.vector_settings.status_ready_desc',
          'Embedding 连接已验证，当前环境可以使用固定向量档案。',
          'The embedding connection is verified and the fixed vector profile is available.'
        )
      },
      vector_store_pending: {
        label: copy(
          'admin.vector_settings.status_vector_pending',
          '等待向量库',
          'Vector store pending'
        ),
        tone: 'warning',
        description: copy(
          'admin.vector_settings.status_vector_pending_desc',
          'Embedding 已验证；生产部署仍需准备 Zilliz Cloud。',
          'Embedding is verified; the production deployment still needs Zilliz Cloud.'
        )
      },
      reindex_required: {
        label: copy(
          'admin.vector_settings.status_reindex_required',
          '需要重建索引',
          'Reindex required'
        ),
        tone: 'warning',
        description: copy(
          'admin.vector_settings.status_reindex_required_desc',
          '连接已经就绪，但现有站点资料尚未迁入当前 Zilliz 向量空间。',
          'Connections are ready, but existing Site Knowledge has not been moved into the active Zilliz space.'
        )
      },
      rebuilding: {
        label: copy('admin.vector_settings.status_rebuilding', '正在重建', 'Rebuilding'),
        tone: 'warning',
        description: copy(
          'admin.vector_settings.status_rebuilding_desc',
          '正在把 Cloud 已保存的站点资料迁入 Zilliz。',
          'Cloud-owned Site Knowledge is being moved into Zilliz.'
        )
      },
      awaiting_site_sync: {
        label: copy(
          'admin.vector_settings.status_awaiting_site_sync',
          '站点自动更新中',
          'Refreshing sites'
        ),
        tone: 'warning',
        description: copy(
          'admin.vector_settings.status_awaiting_site_sync_desc',
          '站点正在后台分批重送公开内容；无需站点管理员手动执行全量同步。',
          'Sites are resending public content in bounded background batches; no site-admin full sync is required.'
        )
      },
      failed: {
        label: copy('admin.vector_settings.status_rebuild_failed', '重建失败', 'Rebuild failed'),
        tone: 'failed',
        description: copy(
          'admin.vector_settings.status_rebuild_failed_desc',
          '索引尚不可用，请查看诊断后重试。',
          'The index is not usable yet. Review diagnostics and retry.'
        )
      },
      probe_required: {
        label: copy('admin.vector_settings.status_probe_required', '需要验证', 'Probe required'),
        tone: 'warning',
        description: copy(
          'admin.vector_settings.status_probe_required_desc',
          '已保存凭据，但尚未通过当前固定档案的真实向量探测。',
          'A credential exists but has not passed the current profile probe.'
        )
      }
    };
    return (
      states[profile?.status || ''] || {
        label: copy('admin.vector_settings.status_not_configured', '未配置', 'Not configured'),
        tone: 'inactive' as const,
        description: copy(
          'admin.vector_settings.status_not_configured_desc',
          '填写 SiliconFlow API Key 后即可验证并启用。',
          'Enter a SiliconFlow API key to verify and enable the profile.'
        )
      }
    );
  }, [copy, profile?.status]);

  if (loading) return <AdminRouteSkeleton />;
  const indexNeedsAction = ['reindex_required', 'awaiting_site_sync', 'failed'].includes(
    profile?.validation.index.status || ''
  );
  const connectionReady = profile?.validation.connection.status === 'ready';
  const indexReady = profile?.validation.index.status === 'ready';
  const retrievalPassed = profile?.validation.retrieval.status === 'passed';

  return (
    <BackofficePageStack data-page-model="configuration">
      <BackofficePrimaryPanel
        eyebrow={copy('admin.vector_settings.eyebrow', 'Site Knowledge', 'Site Knowledge')}
        title={copy('admin.vector_settings.title', '站点向量服务', 'Site vector service')}
        description={copy(
          'admin.vector_settings.description',
          '使用平台固定的中文站点向量档案。管理员只需提供供应商密钥和 Zilliz 连接凭证。',
          'Use the platform-defined Chinese Site Knowledge vector profile. Admins only provide the provider key and Zilliz connection credentials.'
        )}
        actions={
          <Link href="/admin/vector-observability" className="btn btn-secondary">
            {copy(
              'admin.vector_settings.open_observability',
              '查看向量诊断',
              'Open vector diagnostics'
            )}
          </Link>
        }
        summary={
          <BackofficeSummaryStrip
            items={[
              {
                label: 'Profile',
                value: profile?.profile_id || 'site-knowledge.zh.v1'
              },
              {
                label: copy('admin.vector_settings.model', '模型', 'Model'),
                value: profile?.model_id || 'BAAI/bge-m3'
              },
              {
                label: copy('admin.vector_settings.current_status', '当前状态', 'Current status'),
                value: status.label
              }
            ]}
          />
        }
      >
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          {copy(
            'admin.vector_settings.boundary',
            '该页面只管理 Cloud 运行配置；Site Knowledge 结果仍为建议型，不拥有 WordPress 写入权限。',
            'This page manages Cloud runtime configuration only. Site Knowledge remains suggestion-only and has no WordPress write authority.'
          )}
        </p>
      </BackofficePrimaryPanel>

      {error ? (
        <BackofficeDiagnosticNotice
          message={error}
          retryLabel={copy('common.retry', '重试', 'Retry')}
          onRetry={() => void loadProfile()}
        />
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
        >
          {message}
        </p>
      ) : null}

      <BackofficeSectionPanel data-vector-section="configuration">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {copy(
                'admin.vector_settings.configuration_title',
                '向量配置',
                'Vector configuration'
              )}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {copy(
                'admin.vector_settings.configuration_desc',
                '固定档案由平台维护；只填写连接凭据并保存。',
                'The platform owns the fixed profile; only connection values can be saved here.'
              )}
            </p>
          </div>
          <BackofficeStatusBadge label={status.label} status={status.tone} />
        </div>
        <div className="mt-4" data-vector-section="fixed-profile">
          <AdminConfigurationTable
            ariaLabel={copy(
              'admin.vector_settings.configuration_table',
              '向量配置表',
              'Vector configuration table'
            )}
            itemHeading={copy('admin.vector_settings.configuration_item', '配置项', 'Setting')}
            valueHeading={copy(
              'admin.vector_settings.configuration_value',
              '当前值',
              'Current value'
            )}
            detailHeading={copy(
              'admin.vector_settings.configuration_note',
              '状态 / 说明',
              'Status / note'
            )}
          >
            <AdminConfigurationRow
              rowId="fixed-profile"
              label={copy(
                'admin.vector_settings.fixed_profile_title',
                '固定向量档案',
                'Fixed vector profile'
              )}
              value={
                <code className="text-xs">
                  {profile?.profile_id || 'site-knowledge.zh.v1'} ·{' '}
                  {profile?.model_id || 'BAAI/bge-m3'} · {profile?.dimensions || 1024} ·{' '}
                  {profile?.metric || 'COSINE'}
                </code>
              }
              detail={copy(
                'admin.vector_settings.fixed_profile_desc',
                '模型、维度、距离算法和生产向量库由平台统一维护，不能在此修改。',
                'The platform owns the model, dimensions, metric, and production vector store.'
              )}
            />
            <AdminConfigurationRow
              rowId="provider-key"
              label="SiliconFlow API Key"
              value={
                <AdminCredentialField
                  mode={profile?.provider.configured ? 'edit' : 'create'}
                  revealed={providerCredentialRevealed}
                  value={credential}
                  label="SiliconFlow API Key"
                  unchangedLabel={copy(
                    'admin.vector_settings.credential_saved',
                    '已保存，原值不会显示',
                    'Saved; the original value is never shown'
                  )}
                  replaceLabel={copy(
                    'admin.vector_settings.replace_credential',
                    '替换密钥',
                    'Replace key'
                  )}
                  cancelReplacementLabel={copy(
                    'admin.vector_settings.cancel_replace_credential',
                    '取消替换',
                    'Cancel replacement'
                  )}
                  keepCurrentPlaceholder={copy(
                    'admin.vector_settings.new_credential',
                    '输入新 API Key',
                    'Enter a new API key'
                  )}
                  density="compact"
                  hideLabel
                  onChange={setCredential}
                  onReveal={() => setProviderCredentialRevealed(true)}
                  onCancelReplacement={() => {
                    setProviderCredentialRevealed(false);
                    setCredential('');
                  }}
                />
              }
              detail={
                profile?.provider.verified
                  ? copy(
                      'admin.vector_settings.provider_verified',
                      '已保存并通过 BGE-M3 1024 维真实探测。',
                      'Saved and verified by a live BGE-M3 1024-dimension probe.'
                    )
                  : copy(
                      'admin.vector_settings.provider_unverified',
                      '保存后执行真实探测；密钥不会回显。',
                      'Saving runs a live probe; the key is never returned.'
                    )
              }
            />
            <AdminConfigurationRow
              rowId="zilliz-endpoint"
              label="Zilliz Endpoint"
              value={
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  value={zillizEndpoint}
                  onChange={(event) => setZillizEndpoint(event.target.value)}
                  placeholder="https://…vectordb.zilliz…"
                  aria-label="Zilliz Endpoint"
                />
              }
              detail={copy(
                'admin.vector_settings.zilliz_endpoint_notice',
                '使用集群详情中的公共 Endpoint。',
                'Use the public endpoint from the cluster details.'
              )}
            />
            <AdminConfigurationRow
              rowId="zilliz-token"
              label="Zilliz Token"
              value={
                <AdminCredentialField
                  mode={profile?.vector_store.token_configured ? 'edit' : 'create'}
                  revealed={zillizTokenRevealed}
                  value={zillizToken}
                  label="Zilliz Token"
                  unchangedLabel={copy(
                    'admin.vector_settings.token_saved',
                    '已保存，原值不会显示',
                    'Saved; the original value is never shown'
                  )}
                  replaceLabel={copy(
                    'admin.vector_settings.replace_token',
                    '替换 Token',
                    'Replace token'
                  )}
                  cancelReplacementLabel={copy(
                    'admin.vector_settings.cancel_replace_token',
                    '取消替换',
                    'Cancel replacement'
                  )}
                  keepCurrentPlaceholder={copy(
                    'admin.vector_settings.new_token',
                    '输入新 Token',
                    'Enter a new token'
                  )}
                  density="compact"
                  hideLabel
                  onChange={setZillizToken}
                  onReveal={() => setZillizTokenRevealed(true)}
                  onCancelReplacement={() => {
                    setZillizTokenRevealed(false);
                    setZillizToken('');
                  }}
                />
              }
              detail={
                profile?.vector_store.verified
                  ? copy(
                      'admin.vector_settings.store_verified',
                      '已保存并通过固定 Collection 检测。',
                      'Saved and verified against the fixed collection.'
                    )
                  : copy(
                      'admin.vector_settings.store_unverified',
                      '保存后会检测并初始化固定 Collection。',
                      'Saving checks and initializes the fixed collection.'
                    )
              }
            />
            <AdminConfigurationRow
              rowId="fixed-collection"
              label="Collection"
              value={
                <code className="text-xs">
                  {profile?.vector_store.collection || 'site_knowledge_zh_v1'}
                </code>
              }
              detail={copy(
                'admin.vector_settings.collection_fixed',
                '固定为 1024 维 COSINE；不兼容时不会修改。',
                'Fixed to 1024-dimension COSINE; incompatible collections are not changed.'
              )}
            />
          </AdminConfigurationTable>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingConfiguration || saving || savingVectorStore}
            onClick={() => void saveConfiguration()}
          >
            {savingConfiguration
              ? copy('common.saving', '保存中…', 'Saving…')
              : copy('admin.vector_settings.save_configuration', '保存配置', 'Save configuration')}
          </button>
        </div>
      </BackofficeSectionPanel>

      <BackofficeSectionPanel data-vector-section="validation">
        <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            {copy('admin.vector_settings.validation_title', '验证结果', 'Validation results')}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {copy(
              'admin.vector_settings.validation_desc',
              '保存会完成连接检测；索引和真实检索证据在此持续更新。',
              'Saving completes connection checks; index and live-retrieval evidence continues to update here.'
            )}
          </p>
        </div>
        <div className="mt-4">
          <AdminConfigurationTable
            ariaLabel={copy(
              'admin.vector_settings.validation_table',
              '验证结果表',
              'Validation results table'
            )}
            itemHeading={copy('admin.vector_settings.validation_item', '验证项', 'Check')}
            valueHeading={copy('admin.vector_settings.validation_result', '结果', 'Result')}
            detailHeading={copy(
              'admin.vector_settings.validation_evidence',
              '证据 / 后续操作',
              'Evidence / next step'
            )}
          >
            <AdminConfigurationRow
              rowId="connection-check"
              label={`1. ${copy('admin.vector_settings.connection_check', '连接检测', 'Connection check')}`}
              value={
                <BackofficeStatusBadge
                  label={
                    connectionReady
                      ? copy('common.ready', '已通过', 'Passed')
                      : copy('admin.vector_settings.not_ready', '未完成', 'Not ready')
                  }
                  status={connectionReady ? 'success' : 'inactive'}
                />
              }
              detail={copy(
                'admin.vector_settings.connection_check_desc',
                'Embedding 与 Zilliz 均需通过真实探测。',
                'Both embedding and Zilliz must pass live probes.'
              )}
            />
            <AdminConfigurationRow
              rowId="index-check"
              label={`2. ${copy('admin.vector_settings.index_check', '索引检测', 'Index check')}`}
              value={
                <BackofficeStatusBadge
                  label={
                    indexReady
                      ? copy('common.ready', '已通过', 'Passed')
                      : profile?.validation.index.status === 'awaiting_site_sync'
                        ? copy(
                            'admin.vector_settings.awaiting_site_sync',
                            '站点更新中',
                            'Refreshing sites'
                          )
                        : profile?.validation.index.status === 'empty'
                          ? copy('admin.vector_settings.index_empty', '暂无资料', 'No content')
                          : copy(
                              'admin.vector_settings.reindex_needed',
                              '需要重建',
                              'Rebuild needed'
                            )
                  }
                  status={indexReady ? 'success' : 'warning'}
                />
              }
              detail={
                profile?.validation.index.reason === 'embedding_space_mismatch'
                  ? copy(
                      'admin.vector_settings.index_space_mismatch',
                      '现有资料属于旧向量空间。启动后，各站点会在后台自动重送公开内容，不会混入旧索引。',
                      'Existing content belongs to an older vector space. Once started, sites resend public content in the background without mixing it into the old index.'
                    )
                  : copy(
                      'admin.vector_settings.index_counts',
                      `Cloud 已有 ${profile?.validation.index.source_document_count || 0} 篇资料、${profile?.validation.index.source_chunk_count || 0} 个分块；Zilliz 已确认 ${profile?.validation.index.indexed_chunk_count || 0} 个分块。`,
                      `Cloud has ${profile?.validation.index.source_document_count || 0} documents and ${profile?.validation.index.source_chunk_count || 0} chunks; ${profile?.validation.index.indexed_chunk_count || 0} Zilliz chunks are confirmed.`
                    )
              }
            />
            <AdminConfigurationRow
              rowId="retrieval-check"
              label={`3. ${copy('admin.vector_settings.retrieval_check', '真实检索', 'Live retrieval')}`}
              value={
                <BackofficeStatusBadge
                  label={
                    retrievalPassed
                      ? copy('common.ready', '已通过', 'Passed')
                      : profile?.validation.retrieval.status === 'failed'
                        ? copy('common.failed', '失败', 'Failed')
                        : copy('admin.vector_settings.pending_validation', '等待验证', 'Pending')
                  }
                  status={
                    retrievalPassed
                      ? 'success'
                      : profile?.validation.retrieval.status === 'failed'
                        ? 'failed'
                        : 'inactive'
                  }
                />
              }
              detail={
                retrievalPassed
                  ? copy(
                      'admin.vector_settings.retrieval_passed',
                      `最近一次 Zilliz 搜索返回 ${profile?.validation.retrieval.result_count} 条结果。`,
                      `The latest Zilliz search returned ${profile?.validation.retrieval.result_count} results.`
                    )
                  : copy(
                      'admin.vector_settings.retrieval_pending',
                      '重建后执行一次正常的 Site Knowledge 搜索；这里会自动记录结果，不另设测试入口。',
                      'After rebuilding, run a normal Site Knowledge search. Its evidence appears here automatically.'
                    )
              }
            />
          </AdminConfigurationTable>
        </div>
        {indexNeedsAction ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              {copy(
                'admin.vector_settings.rebuild_boundary',
                '仅迁移 Cloud 已接收的公开站点资料；不会写入 WordPress，也不会重新消耗普通 AI 积分。',
                'Only public content already received by Cloud is moved. WordPress is not written and ordinary AI credits are not consumed.'
              )}
            </p>
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              disabled={rebuilding}
              onClick={() => void rebuildIndex()}
            >
              {rebuilding
                ? copy('admin.vector_settings.rebuilding', '重建中…', 'Rebuilding…')
                : profile?.validation.index.reason === 'embedding_space_mismatch' ||
                    profile?.validation.index.status === 'awaiting_site_sync'
                  ? copy(
                      'admin.vector_settings.start_automatic_sync',
                      '启动自动更新',
                      'Start automatic refresh'
                    )
                  : copy(
                      'admin.vector_settings.rebuild_index',
                      '重建向量索引',
                      'Rebuild vector index'
                    )}
            </button>
          </div>
        ) : null}
      </BackofficeSectionPanel>

      <AdminSettingsDisclosure
        dataUi="vector-settings-technical-details"
        title={copy('admin.vector_settings.advanced_details', '技术详情', 'Technical details')}
        description={copy(
          'admin.vector_settings.technical_details_desc',
          '连接标识、当前后端和索引策略。',
          'Connection identifiers, active backend, and index policy.'
        )}
        statusLabel={status.label}
        statusTone={
          status.tone === 'success'
            ? 'configured'
            : status.tone === 'warning' || status.tone === 'failed'
              ? 'attention'
              : 'neutral'
        }
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Connection ID</dt>
            <dd className="mt-1 break-all text-slate-800 dark:text-slate-100">
              {profile?.provider.connection_id || 'site_knowledge_vector_siliconflow'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              {copy('admin.vector_settings.active_backend', '当前后端', 'Active backend')}
            </dt>
            <dd className="mt-1 text-slate-800 dark:text-slate-100">
              {formatBackend(profile?.active_backend || '')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              {copy('admin.vector_settings.last_verified', '最近验证', 'Last verified')}
            </dt>
            <dd className="mt-1 text-slate-800 dark:text-slate-100">
              {profile?.provider.last_tested_at || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              {copy('admin.vector_settings.reindex_policy', '索引策略', 'Index policy')}
            </dt>
            <dd className="mt-1 text-slate-800 dark:text-slate-100">
              {copy(
                'admin.vector_settings.reindex_required',
                '档案事实变化后必须重建',
                'Reindex after profile facts change'
              )}
            </dd>
          </div>
        </dl>
      </AdminSettingsDisclosure>
    </BackofficePageStack>
  );
}
