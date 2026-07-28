'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BackofficeDiagnosticNotice,
  BackofficeLayer,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeSummaryStrip,
} from '@/components/backoffice/BackofficeScaffold';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminRouteSkeleton } from '@/components/admin/AdminRouteSkeleton';
import { ConfirmModal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';

type ValidationItem = {
  code: string;
  message: string;
  field: string;
};

type Validation = {
  ready_to_publish: boolean;
  blockers: ValidationItem[];
  warnings: ValidationItem[];
  checked_at: string;
};

type RetentionItem = {
  record_id: string;
  label: string;
  public_description: string;
  enforcement: string;
  confirmed: boolean;
  source: string;
};

type ThirdPartyItem = {
  service_id: string;
  service_name: string;
  operator_name: string;
  category: string;
  purpose: string;
  data_categories: string;
  privacy_url: string;
  processing_region: string;
  disclosed: boolean;
};

type ThirdPartyCandidate = {
  service_id: string;
  service_name: string;
  category: string;
  purpose: string;
  data_categories: string;
  in_use: boolean;
  default_disclosed: boolean;
  source: string;
};

type CompliancePayload = {
  schema_version: string;
  brand_name: string;
  operator: {
    entity_name: string;
    entity_type: string;
    public_name: string;
    registration_or_filing: string;
    service_region: string;
  };
  contact: {
    support_email: string;
    support_channel: string;
    service_hours: string;
  };
  refund: {
    auto_renewal: boolean;
    refund_window_days: number;
    processing_business_days: number;
    refund_channel: string;
    request_path: string;
    conditions: string;
  };
  retention: RetentionItem[];
  third_parties: ThirdPartyItem[];
  review: {
    operator_confirmed: boolean;
    legal_review_status: string;
    review_note: string;
  };
};

type VersionRecord = {
  version_id: string;
  version_number?: number;
  updated_at?: string;
  effective_at?: string;
  payload: CompliancePayload;
  validation: Validation;
};

type QqReviewItem = {
  code: string;
  label: string;
  ready: boolean;
  detail: string;
};

type ComplianceWorkspace = {
  draft: VersionRecord;
  published: VersionRecord | null;
  history: VersionRecord[];
  third_party_candidates: ThirdPartyCandidate[];
  qq_review: {
    status: string;
    items: QqReviewItem[];
    manual_external_steps: string[];
  };
};

type ComplianceSection =
  | 'operator'
  | 'refund'
  | 'retention'
  | 'third_parties'
  | 'review'
  | 'checks'
  | 'versions';

const siteComplianceClient = createApiClient({
  cache: 'no-store',
  idempotencyPrefix: 'admin_site_compliance',
});

const inputClassName =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950';
const labelClassName = 'text-sm font-semibold text-slate-800 dark:text-slate-200';
const hintClassName = 'mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400';
const secondaryButtonClassName =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const primaryButtonClassName =
  'rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

function clonePayload(payload: CompliancePayload): CompliancePayload {
  return JSON.parse(JSON.stringify(payload)) as CompliancePayload;
}

function candidateToDisclosure(candidate: ThirdPartyCandidate): ThirdPartyItem {
  return {
    service_id: candidate.service_id,
    service_name: candidate.service_name,
    operator_name: '',
    category: candidate.category,
    purpose: candidate.purpose,
    data_categories: candidate.data_categories,
    privacy_url: '',
    processing_region: '',
    disclosed: candidate.default_disclosed,
  };
}

function formatTime(value: string | undefined, zh: boolean): string {
  if (!value) return zh ? '尚未发布' : 'Not published';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatValidationArea(field: string, zh: boolean): string {
  const labels: Record<string, [string, string]> = {
    operator: ['运营主体', 'Operator'],
    contact: ['联系方式', 'Contact'],
    refund: ['退款说明', 'Refund'],
    retention: ['数据保留', 'Retention'],
    third_parties: ['第三方服务', 'Third parties'],
    review: ['发布确认', 'Publication review'],
  };
  const [zhLabel, enLabel] = labels[field.split('.')[0] || ''] || ['合规资料', 'Compliance'];
  return zh ? zhLabel : enLabel;
}

export default function AdminSiteCompliancePage() {
  const router = useRouter();
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const copy = useCallback((zhText: string, enText: string) => (zh ? zhText : enText), [zh]);
  const [workspace, setWorkspace] = useState<ComplianceWorkspace | null>(null);
  const [payload, setPayload] = useState<CompliancePayload | null>(null);
  const [savedPayload, setSavedPayload] = useState('');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingNavigationHref, setPendingNavigationHref] = useState('');
  const [activeSection, setActiveSection] = useState<ComplianceSection>('operator');

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = (
        await siteComplianceClient.request<ComplianceWorkspace>(
          '/api/admin/site-compliance'
        )
      ).data;
      if (!next?.draft?.payload) {
        throw new Error(copy('合规资料响应无效。', 'Invalid compliance response.'));
      }
      const nextPayload = clonePayload(next.draft.payload);
      setWorkspace(next);
      setPayload(nextPayload);
      setSavedPayload(JSON.stringify(nextPayload));
    } catch (loadError) {
      setError(
        resolveUiErrorMessage(
          loadError,
          copy('无法加载网站合规资料。', 'Failed to load site compliance.')
        )
      );
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const dirty = Boolean(payload) && JSON.stringify(payload) !== savedPayload;
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const warnBeforeNavigation = (event: MouseEvent) => {
      if (!dirty) return;
      const target =
        event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank') return;
      const destination = new URL(target.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === window.location.pathname
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigationHref(
        `${destination.pathname}${destination.search}${destination.hash}`
      );
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', warnBeforeNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', warnBeforeNavigation, true);
    };
  }, [dirty]);

  const validation = workspace?.draft.validation;
  const published = workspace?.published;
  const missingCandidates = useMemo(() => {
    if (!workspace || !payload) return [];
    const known = new Set(payload.third_parties.map((item) => item.service_id));
    return workspace.third_party_candidates.filter(
      (candidate) => candidate.in_use && !known.has(candidate.service_id)
    );
  }, [payload, workspace]);
  const complianceSections: Array<{
    id: ComplianceSection;
    label: string;
    detail: string;
  }> = [
    {
      id: 'operator',
      label: copy('主体与联系方式', 'Operator and contact'),
      detail: copy('主体、品牌、支持渠道', 'Identity, brand, support'),
    },
    {
      id: 'refund',
      label: copy('退款说明', 'Refund disclosure'),
      detail: copy('窗口、时限、申请路径', 'Window, timing, request path'),
    },
    {
      id: 'retention',
      label: copy('数据保留', 'Retention and deletion'),
      detail: copy(`${payload?.retention.length ?? 0} 类记录`, `${payload?.retention.length ?? 0} record types`),
    },
    {
      id: 'third_parties',
      label: copy('第三方服务', 'Third-party services'),
      detail: missingCandidates.length
        ? copy(`${missingCandidates.length} 个待补齐`, `${missingCandidates.length} missing`)
        : copy(`${payload?.third_parties.length ?? 0} 个已登记`, `${payload?.third_parties.length ?? 0} registered`),
    },
    {
      id: 'review',
      label: copy('发布确认', 'Publication review'),
      detail: copy('运营事实与法律审核', 'Operating facts and legal review'),
    },
    {
      id: 'checks',
      label: copy('发布检查', 'Publish checks'),
      detail: validation?.ready_to_publish
        ? copy('检查通过', 'Ready')
        : copy(`${validation?.blockers.length ?? 0} 个阻塞项`, `${validation?.blockers.length ?? 0} blockers`),
    },
    {
      id: 'versions',
      label: copy('版本记录', 'Version history'),
      detail: copy(`${workspace?.history.length ?? 0} 个历史版本`, `${workspace?.history.length ?? 0} historical versions`),
    },
  ];
  const publishCheckRows = [
    ...(validation?.blockers ?? []).map((item) => ({ ...item, tone: 'blocker' as const })),
    ...(validation?.warnings ?? []).map((item) => ({ ...item, tone: 'warning' as const })),
  ];
  const versionRows = [published, ...(workspace?.history ?? [])].reduce<VersionRecord[]>((records, item) => {
    if (item && !records.some((record) => record.version_id === item.version_id)) records.push(item);
    return records;
  }, []);

  function updatePayload(mutator: (next: CompliancePayload) => void) {
    setPayload((current) => {
      if (!current) return current;
      const next = clonePayload(current);
      mutator(next);
      return next;
    });
    setNotice('');
  }

  async function saveDraft() {
    if (!payload) return;
    setAction('save');
    setError('');
    setNotice('');
    try {
      const result = (
        await siteComplianceClient.request<ComplianceWorkspace>(
          '/api/admin/site-compliance/draft',
          {
            method: 'PUT',
            body: { payload },
          }
        )
      ).data;
      const saved = clonePayload(result.draft.payload);
      setWorkspace((current) =>
        current
          ? {
              ...current,
              ...result,
              draft: result.draft,
              published: result.published ?? current.published,
            }
          : result
      );
      setPayload(saved);
      setSavedPayload(JSON.stringify(saved));
      setNotice(copy('草稿已保存并重新检查。', 'Draft saved and revalidated.'));
    } catch (saveError) {
      setError(
        resolveUiErrorMessage(
          saveError,
          copy('保存合规草稿失败。', 'Failed to save the compliance draft.')
        )
      );
    } finally {
      setAction('');
    }
  }

  async function publish() {
    setAction('publish');
    setError('');
    setNotice('');
    try {
      await siteComplianceClient.request<ComplianceWorkspace>(
        '/api/admin/site-compliance/publish',
        { method: 'POST', body: {} }
      );
      setNotice(
        copy(
          '资料已发布，隐私政策、服务条款和帮助页将读取这个版本。',
          'Published. Privacy, terms, and help now read this version.'
        )
      );
      await loadWorkspace();
    } catch (publishError) {
      setError(
        resolveUiErrorMessage(
          publishError,
          copy('发布失败，请先解决阻塞项。', 'Publish failed. Resolve blockers first.')
        )
      );
    } finally {
      setAction('');
    }
  }

  function addMissingCandidates() {
    if (!missingCandidates.length) return;
    updatePayload((next) => {
      next.third_parties.push(...missingCandidates.map(candidateToDisclosure));
    });
  }

  if (loading && !workspace) {
    return <AdminRouteSkeleton />;
  }

  if (!workspace || !payload) {
    return (
      <BackofficeDiagnosticNotice
        message={error || copy('无法加载网站合规资料。', 'Unable to load site compliance.')}
        onRetry={() => void loadWorkspace()}
        retryLabel={copy('重试', 'Retry')}
      />
    );
  }

  return (
    <BackofficePageStack className="min-w-0 space-y-5">
      <BackofficeLayer
        eyebrow={copy('网站与审核资料', 'Public site and review')}
        title={copy('网站合规资料', 'Site compliance')}
        description={copy(
          '维护一份版本化的 Cloud 公开资料；草稿保存后重新检查，只有已发布版本进入公开页面。',
          'Maintain one versioned Cloud disclosure. Saving revalidates the draft; only a published version reaches public pages.'
        )}
        actions={(
          <>
            <button
              type="button"
              className={secondaryButtonClassName}
              disabled={
                dirty ||
                Boolean(action) ||
                !validation?.ready_to_publish
              }
              onClick={() => void publish()}
            >
              {action === 'publish' ? copy('发布中…', 'Publishing…') : copy('发布到公开页面', 'Publish')}
            </button>
            <button
              type="button"
              className={primaryButtonClassName}
              disabled={!dirty || Boolean(action)}
              onClick={() => void saveDraft()}
            >
              {action === 'save' ? copy('保存中…', 'Saving…') : copy('保存草稿', 'Save draft')}
            </button>
          </>
        )}
      />

      {error ? (
        <BackofficeDiagnosticNotice
          message={error}
          onRetry={() => void loadWorkspace()}
          retryLabel={copy('重新加载', 'Reload')}
        />
      ) : null}
      {notice ? (
        <p role="status" aria-live="polite" className="border-l-2 border-emerald-400 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}

      <BackofficeSummaryStrip
        items={[
          {
            label: copy('草稿状态', 'Draft'),
            value: dirty ? copy('有未保存修改', 'Unsaved') : copy('已保存', 'Saved'),
            size: 'compact',
            toneClassName: dirty
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-emerald-700 dark:text-emerald-300',
          },
          {
            label: copy('发布门槛', 'Publish gate'),
            value: validation?.ready_to_publish
              ? copy('可发布', 'Ready')
              : copy(`${validation?.blockers.length ?? 0} 个阻塞项`, `${validation?.blockers.length ?? 0} blockers`),
            size: 'compact',
          },
          {
            label: copy('当前公开版本', 'Published version'),
            value: published?.version_number ? `v${published.version_number}` : '—',
            detail: formatTime(published?.effective_at, zh),
            size: 'compact',
          },
          {
            label: copy('QQ 审核准备', 'QQ review'),
            value: workspace.qq_review.status === 'ready' ? copy('已就绪', 'Ready') : copy('待补充', 'Blocked'),
            size: 'compact',
          },
        ]}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-24" data-ui="site-compliance-directory">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 xl:hidden">
            {copy('当前设置区', 'Current section')}
            <select
              className={inputClassName}
              value={activeSection}
              onChange={(event) => setActiveSection(event.target.value as ComplianceSection)}
            >
              {complianceSections.map((section) => (
                <option key={section.id} value={section.id}>{section.label}</option>
              ))}
            </select>
          </label>
          <nav className="hidden overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 xl:block" aria-label={copy('合规资料目录', 'Compliance sections')}>
            <p className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {copy('设置目录', 'Sections')}
            </p>
            {complianceSections.map((section) => {
              const selected = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-current={selected ? 'page' : undefined}
                  className={`block w-full cursor-pointer border-b border-slate-200 px-3 py-2 text-left last:border-b-0 dark:border-slate-800 ${
                    selected
                      ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/25 dark:text-blue-200'
                      : 'bg-white text-slate-800 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900'
                  }`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span className="block text-sm font-semibold">{section.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{section.detail}</span>
                </button>
              );
            })}
          </nav>
          <p className="mt-3 hidden text-xs leading-5 text-slate-500 dark:text-slate-400 xl:block">
            {copy('切换区域不会丢失当前草稿；离开页面时仍会保护未保存修改。', 'Switching sections keeps the draft; leaving the page still protects unsaved changes.')}
          </p>
        </aside>

        <div className="min-w-0" data-ui="site-compliance-active-panel">
          {activeSection === 'operator' ? (
          <BackofficeSectionPanel>
            <SectionTitle
              title={copy('运营主体与联系方式', 'Operator and contact')}
              description={copy(
                '系统不会从样例邮箱或代码仓库猜测真实主体。带“需确认”的字段必须由运营者核实。',
                'The system never guesses a real operator from samples or repository data. Confirm all marked fields.'
              )}
            />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label={copy('真实运营主体 *', 'Legal operator *')}>
                <input
                  className={inputClassName}
                  value={payload.operator.entity_name}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.operator.entity_name = event.target.value;
                    })
                  }
                  placeholder={copy('企业或个人的真实登记名称', 'Registered legal name')}
                />
              </Field>
              <Field label={copy('主体类型 *', 'Entity type *')}>
                <select
                  className={inputClassName}
                  value={payload.operator.entity_type}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.operator.entity_type = event.target.value;
                    })
                  }
                >
                  <option value="">{copy('请选择', 'Select')}</option>
                  <option value="企业">{copy('企业', 'Company')}</option>
                  <option value="个体工商户">{copy('个体工商户', 'Sole proprietor')}</option>
                  <option value="个人">{copy('个人', 'Individual')}</option>
                  <option value="其他组织">{copy('其他组织', 'Other organization')}</option>
                </select>
              </Field>
              <Field label={copy('公开品牌名', 'Public brand')}>
                <input
                  className={inputClassName}
                  value={payload.operator.public_name}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.operator.public_name = event.target.value;
                    })
                  }
                />
              </Field>
              <Field label={copy('备案号或登记信息', 'Filing or registration')}>
                <input
                  className={inputClassName}
                  value={payload.operator.registration_or_filing}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.operator.registration_or_filing = event.target.value;
                    })
                  }
                  placeholder={copy('没有可暂留空，发布时会提示', 'Optional; publishing warns if blank')}
                />
              </Field>
              <Field label={copy('服务地区', 'Service region')}>
                <input
                  className={inputClassName}
                  value={payload.operator.service_region}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.operator.service_region = event.target.value;
                    })
                  }
                />
              </Field>
              <Field label={copy('支持邮箱', 'Support email')}>
                <input
                  className={inputClassName}
                  type="email"
                  value={payload.contact.support_email}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.contact.support_email = event.target.value;
                    })
                  }
                />
              </Field>
              <Field label={copy('支持渠道', 'Support channel')}>
                <input
                  className={inputClassName}
                  value={payload.contact.support_channel}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.contact.support_channel = event.target.value;
                    })
                  }
                />
              </Field>
              <Field label={copy('客服时间', 'Service hours')}>
                <input
                  className={inputClassName}
                  value={payload.contact.service_hours}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.contact.service_hours = event.target.value;
                    })
                  }
                  placeholder={copy('例如：工作日 09:00–18:00', 'e.g. Weekdays 09:00–18:00')}
                />
              </Field>
            </div>
          </BackofficeSectionPanel>
          ) : null}

          {activeSection === 'refund' ? (
          <BackofficeSectionPanel>
            <SectionTitle
              title={copy('退款说明', 'Refund disclosure')}
              description={copy(
                '14 天窗口和当前不自动续费来自现有产品合同；处理工作日必须由实际运营能力确认。',
                'The 14-day window and no auto-renewal come from current product contracts. Confirm actual processing time.'
              )}
            />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label={copy('退款申请窗口（天）', 'Refund window (days)')}>
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  max={365}
                  value={payload.refund.refund_window_days}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.refund.refund_window_days = Number(event.target.value);
                    })
                  }
                />
              </Field>
              <Field label={copy('处理时限（工作日）*', 'Processing time (business days) *')}>
                <input
                  className={inputClassName}
                  type="number"
                  min={1}
                  max={90}
                  value={payload.refund.processing_business_days || ''}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.refund.processing_business_days = Number(event.target.value);
                    })
                  }
                />
              </Field>
              <Field label={copy('退款渠道', 'Refund channel')}>
                <input
                  className={inputClassName}
                  value={payload.refund.refund_channel}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.refund.refund_channel = event.target.value;
                    })
                  }
                />
              </Field>
              <Field label={copy('申请路径', 'Request path')}>
                <input
                  className={inputClassName}
                  value={payload.refund.request_path}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.refund.request_path = event.target.value;
                    })
                  }
                />
              </Field>
              <Field label={copy('处理条件', 'Conditions')} className="md:col-span-2">
                <textarea
                  className={`${inputClassName} min-h-24`}
                  value={payload.refund.conditions}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.refund.conditions = event.target.value;
                    })
                  }
                />
              </Field>
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={payload.refund.auto_renewal}
                onChange={(event) =>
                  updatePayload((next) => {
                    next.refund.auto_renewal = event.target.checked;
                  })
                }
              />
              {copy('当前套餐存在自动续费', 'Current plans auto-renew')}
            </label>
          </BackofficeSectionPanel>
          ) : null}

          {activeSection === 'retention' ? (
          <BackofficeSectionPanel>
            <SectionTitle
              title={copy('数据保留与清理', 'Retention and deletion')}
              description={copy(
                  '运行结果和插件观测已有代码级执行依据；审计、账号、支付和支持记录目前只可作为政策说明，确认前会阻止发布。',
                  'Runtime results and plugin telemetry have enforcement evidence. Audit, account, payment, and support records block publication until confirmed.'
              )}
            />
            <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
              {payload.retention.map((item, index) => (
                <div key={item.record_id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-950 dark:text-white">{item.label}</h3>
                      <p className={hintClassName}>
                        {copy('依据', 'Source')}: {item.source || '—'} · {item.enforcement || '—'}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={item.confirmed}
                        onChange={(event) =>
                          updatePayload((next) => {
                            next.retention[index].confirmed = event.target.checked;
                          })
                        }
                      />
                      {copy('已确认实际执行', 'Enforcement confirmed')}
                    </label>
                  </div>
                  <textarea
                    className={`${inputClassName} min-h-20`}
                    value={item.public_description}
                    onChange={(event) =>
                      updatePayload((next) => {
                        next.retention[index].public_description = event.target.value;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </BackofficeSectionPanel>
          ) : null}

          {activeSection === 'third_parties' ? (
          <BackofficeSectionPanel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle
                title={copy('第三方服务清单', 'Third-party services')}
                description={copy(
                  '系统从当前启用配置生成候选并识别本机地址；是否属于外部第三方，以及法律主体、隐私政策地址和处理地区，仍需人工核实。',
                  'Candidates come from enabled configuration and local-address detection. Confirm third-party status, legal entities, privacy URLs, and processing regions.'
                )}
              />
              <button
                type="button"
                className={secondaryButtonClassName}
                disabled={!missingCandidates.length}
                onClick={addMissingCandidates}
              >
                {missingCandidates.length
                  ? copy(`补齐 ${missingCandidates.length} 个已启用服务`, `Add ${missingCandidates.length} active services`)
                  : copy('已覆盖当前启用服务', 'Active services covered')}
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {payload.third_parties.length ? (
                payload.third_parties.map((item, index) => (
                  <div
                    key={item.service_id}
                    className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-bold text-slate-950 dark:text-white">
                        {item.service_name || item.service_id}
                      </h3>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={item.disclosed}
                          onChange={(event) =>
                            updatePayload((next) => {
                              next.third_parties[index].disclosed = event.target.checked;
                            })
                          }
                        />
                        {copy('属于第三方并在公开页面披露', 'Third party and publicly disclosed')}
                      </label>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label={copy('服务名称', 'Service name')}>
                        <input
                          className={inputClassName}
                          value={item.service_name}
                          onChange={(event) =>
                            updatePayload((next) => {
                              next.third_parties[index].service_name = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label={copy('法律运营主体', 'Legal operator')}>
                        <input
                          className={inputClassName}
                          value={item.operator_name}
                          onChange={(event) =>
                            updatePayload((next) => {
                              next.third_parties[index].operator_name = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label={copy('处理目的', 'Purpose')} className="md:col-span-2">
                        <textarea
                          className={`${inputClassName} min-h-20`}
                          value={item.purpose}
                          onChange={(event) =>
                            updatePayload((next) => {
                              next.third_parties[index].purpose = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label={copy('数据类别', 'Data categories')}>
                        <input
                          className={inputClassName}
                          value={item.data_categories}
                          onChange={(event) =>
                            updatePayload((next) => {
                              next.third_parties[index].data_categories = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label={copy('处理地区', 'Processing region')}>
                        <input
                          className={inputClassName}
                          value={item.processing_region}
                          onChange={(event) =>
                            updatePayload((next) => {
                              next.third_parties[index].processing_region = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label={copy('隐私政策地址', 'Privacy policy URL')} className="md:col-span-2">
                        <input
                          className={inputClassName}
                          type="url"
                          value={item.privacy_url}
                          onChange={(event) =>
                            updatePayload((next) => {
                              next.third_parties[index].privacy_url = event.target.value;
                            })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  {copy('尚未发现已启用的第三方服务。', 'No enabled third-party services found.')}
                </p>
              )}
            </div>
          </BackofficeSectionPanel>
          ) : null}

          {activeSection === 'review' ? (
          <BackofficeSectionPanel>
            <SectionTitle
              title={copy('发布确认', 'Publication review')}
              description={copy(
                '这是运营事实确认，不代替正式法律意见。正式上线前仍建议由合适的法律顾问复核。',
                'This confirms operating facts; it is not legal advice. Obtain appropriate legal review before launch.'
              )}
            />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label={copy('法律审核状态', 'Legal review status')}>
                <select
                  className={inputClassName}
                  value={payload.review.legal_review_status}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.review.legal_review_status = event.target.value;
                    })
                  }
                >
                  <option value="pending">{copy('待审核', 'Pending')}</option>
                  <option value="reviewing">{copy('审核中', 'In review')}</option>
                  <option value="approved">{copy('已通过', 'Approved')}</option>
                </select>
              </Field>
              <Field label={copy('审核备注', 'Review note')}>
                <input
                  className={inputClassName}
                  value={payload.review.review_note}
                  onChange={(event) =>
                    updatePayload((next) => {
                      next.review.review_note = event.target.value;
                    })
                  }
                />
              </Field>
            </div>
            <label className="mt-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/25 dark:text-blue-100">
              <input
                className="mt-1"
                type="checkbox"
                checked={payload.review.operator_confirmed}
                onChange={(event) =>
                  updatePayload((next) => {
                    next.review.operator_confirmed = event.target.checked;
                  })
                }
              />
              <span>
                <strong>{copy('我已核对运营事实。', 'I verified the operating facts.')}</strong>
                <span className="mt-1 block opacity-80">
                  {copy(
                    '确认主体、联系方式、退款时限、保留期限与第三方服务资料真实有效。',
                    'Confirm that operator, contact, refund, retention, and third-party details are accurate.'
                  )}
                </span>
              </span>
            </label>
          </BackofficeSectionPanel>
          ) : null}

          {activeSection === 'checks' ? (
            <div className="space-y-4">
              <SectionTitle
                title={copy('发布检查', 'Publish checks')}
                description={
                  dirty
                    ? copy('当前结果对应最近一次保存；先保存草稿，系统才会重新检查本次修改。', 'These results reflect the latest save. Save the draft to revalidate current edits.')
                    : copy('以下结果来自最近一次保存。', 'Results are from the latest save.')
                }
              />
              <AdminDataTableFrame
                title={copy('合规检查结果', 'Compliance results')}
                resultLabel={publishCheckRows.length
                  ? copy(`${publishCheckRows.length} 个结果`, `${publishCheckRows.length} results`)
                  : copy('全部通过', 'All clear')}
                dataUi="site-compliance-validation-table"
                density="compact"
              >
                <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[24%]" />
                    <col className="w-[60%]" />
                  </colgroup>
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-1.5" scope="col">{copy('状态', 'Status')}</th>
                      <th className="px-3 py-1.5" scope="col">{copy('检查项', 'Check')}</th>
                      <th className="px-3 py-1.5" scope="col">{copy('说明 / 下一步', 'Detail / next step')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {publishCheckRows.length ? publishCheckRows.map((item, index) => (
                      <tr key={`${item.code}-${item.field}-${index}`}>
                        <td className="px-3 py-2 align-top">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${
                            item.tone === 'blocker'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
                          }`}>
                            {item.tone === 'blocker' ? copy('阻塞', 'Blocked') : copy('提醒', 'Warning')}
                          </span>
                        </td>
                        <th className="px-3 py-2 align-top font-semibold text-slate-900 dark:text-white" scope="row">{formatValidationArea(item.field, zh)}</th>
                        <td className="break-words px-3 py-2 align-top text-slate-600 dark:text-slate-300">{item.message}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-3" colSpan={3}>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{copy('没有阻塞项或提醒。', 'No blockers or warnings.')}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </AdminDataTableFrame>

              <AdminDataTableFrame
                title={copy('QQ 登录审核清单', 'QQ login review')}
                resultLabel={workspace.qq_review.status === 'ready' ? copy('已就绪', 'Ready') : copy('待补充', 'Blocked')}
                dataUi="site-compliance-qq-review-table"
                density="compact"
              >
                <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[28%]" />
                    <col className="w-[54%]" />
                  </colgroup>
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-1.5" scope="col">{copy('状态', 'Status')}</th>
                      <th className="px-3 py-1.5" scope="col">{copy('检查项', 'Check')}</th>
                      <th className="px-3 py-1.5" scope="col">{copy('说明', 'Detail')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {workspace.qq_review.items.map((item) => (
                      <tr key={item.code}>
                        <td className="px-3 py-2 align-top">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${
                            item.ready
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
                          }`}>
                            {item.ready ? copy('通过', 'Ready') : copy('待补充', 'Blocked')}
                          </span>
                        </td>
                        <th className="px-3 py-2 align-top font-semibold text-slate-900 dark:text-white" scope="row">{item.label}</th>
                        <td className="break-all px-3 py-2 align-top text-slate-600 dark:text-slate-300">{item.detail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminDataTableFrame>

              {publishCheckRows.length ? (
                <details className="border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                  <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                    {copy('检查技术详情', 'Check technical details')}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {publishCheckRows.map((item, index) => (
                      <li key={`${item.code}-${item.field}-${index}`} className="break-all">
                        <code>{item.code}</code> · <code>{item.field || '—'}</code>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <details className="border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                  {copy('QQ 外部提交步骤', 'QQ external submission steps')}
                </summary>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {copy('这里只记录外部操作说明；主体资质和开放平台提交仍在 QQ 互联控制台完成。', 'This is guidance only; qualifications and submission remain in QQ Connect.')}
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-slate-600 dark:text-slate-400">
                  {workspace.qq_review.manual_external_steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </details>
            </div>
          ) : null}

          {activeSection === 'versions' ? (
            <div className="space-y-4">
              <SectionTitle
                title={copy('版本记录', 'Version history')}
                description={copy('公开页面只读取当前已发布版本；历史版本保持只读。', 'Public pages read only the current published version; history remains read-only.')}
              />
              <AdminDataTableFrame
                title={copy('合规资料版本', 'Compliance versions')}
                resultLabel={copy(`${versionRows.length} 个版本`, `${versionRows.length} versions`)}
                dataUi="site-compliance-version-table"
                density="compact"
              >
                <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[20%]" />
                    <col className="w-[34%]" />
                    <col className="w-[28%]" />
                  </colgroup>
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-1.5" scope="col">{copy('版本', 'Version')}</th>
                      <th className="px-3 py-1.5" scope="col">{copy('状态', 'Status')}</th>
                      <th className="px-3 py-1.5" scope="col">{copy('生效 / 更新时间', 'Effective / updated')}</th>
                      <th className="px-3 py-1.5" scope="col">{copy('发布检查', 'Publish checks')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {versionRows.length ? versionRows.map((version) => {
                      const isPublished = published?.version_id === version.version_id;
                      return (
                        <tr key={version.version_id}>
                          <th className="px-3 py-2 align-top font-semibold text-slate-900 dark:text-white" scope="row">
                            <span className="block">{version.version_number ? `v${version.version_number}` : '—'}</span>
                            <span className="mt-0.5 block truncate font-mono text-xs font-normal text-slate-500">{version.version_id}</span>
                          </th>
                          <td className="px-3 py-2 align-top">
                            <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${
                              isPublished
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                            }`}>
                              {isPublished ? copy('当前公开', 'Published') : copy('历史', 'Historical')}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-300">{formatTime(version.effective_at || version.updated_at, zh)}</td>
                          <td className="px-3 py-2 align-top">
                            <span className={version.validation.ready_to_publish ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                              {version.validation.ready_to_publish
                                ? copy('通过', 'Ready')
                                : copy(`${version.validation.blockers.length} 个阻塞项`, `${version.validation.blockers.length} blockers`)}
                            </span>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td className="px-3 py-3 text-slate-500" colSpan={4}>{copy('尚无版本记录。', 'No versions yet.')}</td></tr>
                    )}
                  </tbody>
                </table>
              </AdminDataTableFrame>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingNavigationHref)}
        title={copy('放弃未保存的修改？', 'Leave with unsaved changes?')}
        message={copy(
          '离开此页会丢弃当前修改，已经保存的草稿和公开版本不会受影响。',
          'Leaving discards current edits. The saved draft and published version are unaffected.'
        )}
        confirmLabel={copy('放弃并离开', 'Discard and leave')}
        cancelLabel={copy('继续编辑', 'Keep editing')}
        variant="danger"
        onClose={() => setPendingNavigationHref('')}
        onConfirm={() => {
          const href = pendingNavigationHref;
          setPendingNavigationHref('');
          if (href) router.push(href);
        }}
      />
    </BackofficePageStack>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`${labelClassName} ${className}`}>
      {label}
      {children}
    </label>
  );
}
