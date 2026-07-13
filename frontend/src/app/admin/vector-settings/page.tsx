'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackofficeDiagnosticNotice,
  BackofficeDisclosure,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeSummaryStrip,
} from '@/components/backoffice/BackofficeScaffold';
import { AdminRouteSkeleton } from '@/components/admin/AdminRouteSkeleton';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { useLocale } from '@/contexts/LocaleContext';
import { resolveUiErrorMessage } from '@/lib/errors';

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
};

function formatBackend(value: string): string {
  if (value === 'zilliz_cloud') return 'Zilliz Cloud';
  if (value === 'postgres_json') return 'PostgreSQL JSON';
  return value || '—';
}

export default function VectorSettingsPage() {
  const { locale, t } = useLocale();
  const zh = locale.startsWith('zh');
  const copy = useCallback((key: string, zhText: string, enText: string) => (
    t(key, {}, zh ? zhText : enText)
  ), [t, zh]);
  const [profile, setProfile] = useState<VectorProfile | null>(null);
  const [credential, setCredential] = useState('');
  const [zillizEndpoint, setZillizEndpoint] = useState('');
  const [zillizToken, setZillizToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingVectorStore, setSavingVectorStore] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadProfile = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/site-knowledge-vector-profile', {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resolveUiErrorMessage(
          payload,
          copy('admin.vector_settings.load_error', '加载向量服务失败。', 'Failed to load the vector service.')
        ));
      }
      const nextProfile = payload?.data as VectorProfile;
      setProfile(nextProfile);
      setZillizEndpoint(nextProfile?.vector_store?.endpoint || '');
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : copy('admin.vector_settings.load_error', '加载向量服务失败。', 'Failed to load the vector service.'));
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function saveAndVerify() {
    if (!credential.trim() && !profile?.provider.configured) {
      setError(copy(
        'admin.vector_settings.credential_required',
        '请填写 SiliconFlow API Key。',
        'Enter the SiliconFlow API key.'
      ));
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/site-knowledge-vector-profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credential.trim() || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.status === 'error') {
        throw new Error(resolveUiErrorMessage(
          payload,
          copy('admin.vector_settings.save_error', '保存并验证失败。', 'Save and verification failed.')
        ));
      }
      setProfile(payload?.data as VectorProfile);
      setCredential('');
      setMessage(copy(
        'admin.vector_settings.saved',
        'SiliconFlow 已通过 BGE-M3 1024 维真实探测，配置已启用。',
        'SiliconFlow passed the live BGE-M3 1024-dimension probe and is now active.'
      ));
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : copy('admin.vector_settings.save_error', '保存并验证失败。', 'Save and verification failed.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveAndVerifyVectorStore() {
    if (!zillizEndpoint.trim()) {
      setError(copy(
        'admin.vector_settings.zilliz_endpoint_required',
        '请填写 Zilliz Endpoint。',
        'Enter the Zilliz endpoint.'
      ));
      return;
    }
    if (!zillizToken.trim() && !profile?.vector_store.token_configured) {
      setError(copy(
        'admin.vector_settings.zilliz_token_required',
        '请填写 Zilliz Token。',
        'Enter the Zilliz token.'
      ));
      return;
    }
    setSavingVectorStore(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/site-knowledge-vector-profile/vector-store', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: zillizEndpoint.trim(),
          token: zillizToken.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.status === 'error') {
        throw new Error(resolveUiErrorMessage(
          payload,
          copy(
            'admin.vector_settings.zilliz_save_error',
            'Zilliz 保存并检测失败。',
            'Zilliz save and verification failed.'
          )
        ));
      }
      const nextProfile = payload?.data as VectorProfile;
      setProfile(nextProfile);
      setZillizEndpoint(nextProfile?.vector_store?.endpoint || zillizEndpoint.trim());
      setZillizToken('');
      setMessage(copy(
        'admin.vector_settings.zilliz_saved',
        'Zilliz Cloud 已连接，固定 Collection 已通过 1024 维 COSINE 检测。',
        'Zilliz Cloud is connected and the fixed collection passed its 1024-dimension COSINE check.'
      ));
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : copy(
          'admin.vector_settings.zilliz_save_error',
          'Zilliz 保存并检测失败。',
          'Zilliz save and verification failed.'
        ));
    } finally {
      setSavingVectorStore(false);
    }
  }

  const status = useMemo(() => {
    switch (profile?.status) {
      case 'ready':
        return {
          label: copy('admin.vector_settings.status_ready', '可用', 'Ready'),
          tone: 'success',
          description: copy(
            'admin.vector_settings.status_ready_desc',
            'Embedding 连接已验证，当前环境可以使用固定向量档案。',
            'The embedding connection is verified and the fixed vector profile is available.'
          ),
        };
      case 'vector_store_pending':
        return {
          label: copy('admin.vector_settings.status_vector_pending', '等待向量库', 'Vector store pending'),
          tone: 'warning',
          description: copy(
            'admin.vector_settings.status_vector_pending_desc',
            'Embedding 已验证；生产部署仍需准备 Zilliz Cloud。',
            'Embedding is verified; the production deployment still needs Zilliz Cloud.'
          ),
        };
      case 'probe_required':
        return {
          label: copy('admin.vector_settings.status_probe_required', '需要验证', 'Probe required'),
          tone: 'warning',
          description: copy(
            'admin.vector_settings.status_probe_required_desc',
            '已保存凭据，但尚未通过当前固定档案的真实向量探测。',
            'A credential exists but has not passed the current profile probe.'
          ),
        };
      default:
        return {
          label: copy('admin.vector_settings.status_not_configured', '未配置', 'Not configured'),
          tone: 'inactive',
          description: copy(
            'admin.vector_settings.status_not_configured_desc',
            '填写 SiliconFlow API Key 后即可验证并启用。',
            'Enter a SiliconFlow API key to verify and enable the profile.'
          ),
        };
    }
  }, [copy, profile?.status]);

  if (loading) return <AdminRouteSkeleton />;

  return (
    <BackofficePageStack data-page-model="configuration">
      <BackofficePrimaryPanel
        eyebrow={copy('admin.vector_settings.eyebrow', 'Site Knowledge', 'Site Knowledge')}
        title={copy('admin.vector_settings.title', '站点向量服务', 'Site vector service')}
        description={copy(
          'admin.vector_settings.description',
          '使用平台固定的中文站点向量档案。管理员只需提供供应商密钥。',
          'Use the platform-defined Chinese Site Knowledge vector profile. The provider key is the only editable setting.'
        )}
        actions={(
          <Link href="/admin/vector-observability" className="btn btn-secondary">
            {copy('admin.vector_settings.open_observability', '查看向量诊断', 'Open vector diagnostics')}
          </Link>
        )}
        summary={<BackofficeSummaryStrip items={[
          { label: 'Profile', value: profile?.profile_id || 'site-knowledge.zh.v1' },
          { label: copy('admin.vector_settings.model', '模型', 'Model'), value: profile?.model_id || 'BAAI/bge-m3' },
          { label: copy('admin.vector_settings.current_status', '当前状态', 'Current status'), value: status.label },
        ]} />}
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
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          {message}
        </p>
      ) : null}

      <BackofficeSectionPanel data-vector-section="status">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {copy('admin.vector_settings.status_title', '运行状态', 'Runtime status')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{status.description}</p>
          </div>
          <BackofficeStatusBadge label={status.label} status={status.tone} />
        </div>
      </BackofficeSectionPanel>

      <BackofficeSectionPanel data-vector-section="fixed-profile">
        <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            {copy('admin.vector_settings.fixed_profile_title', '固定向量档案', 'Fixed vector profile')}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {copy(
              'admin.vector_settings.fixed_profile_desc',
              '模型、维度、距离算法和生产向量库由平台统一维护，不能在此修改。',
              'The platform owns the model, dimensions, metric, and production vector store.'
            )}
          </p>
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">Profile</dt><dd className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{profile?.profile_id || 'site-knowledge.zh.v1'}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('admin.vector_settings.model', '模型', 'Model')}</dt><dd className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{profile?.model_id || 'BAAI/bge-m3'}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('admin.vector_settings.dimensions', '向量维度', 'Vector dimensions')}</dt><dd className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{profile?.dimensions || 1024}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('admin.vector_settings.metric', '距离算法', 'Metric')}</dt><dd className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{profile?.metric || 'COSINE'}</dd></div>
        </dl>
      </BackofficeSectionPanel>

      <BackofficeSectionPanel data-vector-section="provider-key">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {copy('admin.vector_settings.provider_title', '向量生成服务', 'Embedding provider')}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              SiliconFlow · BAAI/bge-m3
            </p>
          </div>
          <BackofficeStatusBadge
            label={profile?.provider.verified
              ? copy('common.ready', '已验证', 'Verified')
              : copy('admin.vector_settings.status_not_configured', '未配置', 'Not configured')}
            status={profile?.provider.verified ? 'success' : 'inactive'}
          />
        </div>
        <div className="mt-4 max-w-2xl">
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            SiliconFlow API Key
            <input
              type="password"
              autoComplete="new-password"
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              placeholder={profile?.provider.configured
                ? copy('admin.vector_settings.keep_credential', '留空则使用已保存密钥重新验证', 'Leave blank to reverify the saved key')
                : ''}
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {copy(
              'admin.vector_settings.probe_notice',
              '保存时会真实调用 BGE-M3，并严格校验返回值为 1024 个有限数值。密钥不会回显。',
              'Saving runs a live BGE-M3 probe and requires exactly 1024 finite numeric values. The key is never returned.'
            )}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || (!credential.trim() && !profile?.provider.configured)}
              onClick={() => void saveAndVerify()}
            >
              {saving
                ? copy('admin.vector_settings.verifying', '验证中…', 'Verifying…')
                : copy('admin.vector_settings.save_verify', '保存并验证', 'Save and verify')}
            </button>
          </div>
        </div>
      </BackofficeSectionPanel>

      <BackofficeSectionPanel data-vector-section="vector-store">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {copy('admin.vector_settings.store_title', '向量数据库', 'Vector database')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {copy(
                'admin.vector_settings.store_desc',
                '生产环境固定使用 Zilliz Cloud。填写集群地址和 Token 后，系统会检测并初始化固定 Collection。',
                'Production is fixed to Zilliz Cloud. Enter the cluster endpoint and token to verify and initialize the fixed collection.'
              )}
            </p>
          </div>
          <BackofficeStatusBadge
            label={profile?.vector_store.verified
              ? copy('common.ready', '已就绪', 'Ready')
              : copy('admin.vector_settings.status_not_configured', '未配置', 'Not configured')}
            status={profile?.vector_store.verified ? 'success' : 'inactive'}
          />
        </div>
        <div className="mt-4 max-w-2xl space-y-4">
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Zilliz Endpoint
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              value={zillizEndpoint}
              onChange={(event) => setZillizEndpoint(event.target.value)}
              placeholder="https://…zillizcloud.com"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Zilliz Token
            <input
              type="password"
              autoComplete="new-password"
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              value={zillizToken}
              onChange={(event) => setZillizToken(event.target.value)}
              placeholder={profile?.vector_store.token_configured
                ? copy('admin.vector_settings.keep_zilliz_token', '留空则使用已保存 Token 重新检测', 'Leave blank to recheck the saved token')
                : ''}
            />
          </label>
          <dl className="grid gap-4 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-900 sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">Collection</dt><dd className="mt-1 font-semibold text-slate-950 dark:text-white">{profile?.vector_store.collection || 'site_knowledge_zh_v1'}</dd></div>
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('admin.vector_settings.dimensions', '向量维度', 'Vector dimensions')}</dt><dd className="mt-1 font-semibold text-slate-950 dark:text-white">1024</dd></div>
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('admin.vector_settings.metric', '距离算法', 'Metric')}</dt><dd className="mt-1 font-semibold text-slate-950 dark:text-white">COSINE</dd></div>
          </dl>
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            {copy(
              'admin.vector_settings.zilliz_probe_notice',
              'Collection 不存在时会自动创建；已存在但结构不兼容时不会修改，将直接提示错误。Token 不会回显。',
              'A missing collection is created automatically. An incompatible existing collection is left unchanged and reported as an error. The token is never returned.'
            )}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                savingVectorStore ||
                !zillizEndpoint.trim() ||
                (!zillizToken.trim() && !profile?.vector_store.token_configured)
              }
              onClick={() => void saveAndVerifyVectorStore()}
            >
              {savingVectorStore
                ? copy('admin.vector_settings.verifying', '检测中…', 'Checking…')
                : copy('admin.vector_settings.save_check', '保存并检测', 'Save and check')}
            </button>
          </div>
        </div>
      </BackofficeSectionPanel>

      <BackofficeDisclosure summary={copy('admin.vector_settings.advanced_details', '技术详情', 'Technical details')}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">Connection ID</dt><dd className="mt-1 break-all text-slate-800 dark:text-slate-100">{profile?.provider.connection_id || 'site_knowledge_vector_siliconflow'}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('admin.vector_settings.active_backend', '当前后端', 'Active backend')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{formatBackend(profile?.active_backend || '')}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('admin.vector_settings.last_verified', '最近验证', 'Last verified')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{profile?.provider.last_tested_at || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('admin.vector_settings.reindex_policy', '索引策略', 'Index policy')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{copy('admin.vector_settings.reindex_required', '档案事实变化后必须重建', 'Reindex after profile facts change')}</dd></div>
        </dl>
      </BackofficeDisclosure>
    </BackofficePageStack>
  );
}
