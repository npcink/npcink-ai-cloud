'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BackofficeDiagnosticNotice,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeSummaryStrip,
} from '@/components/backoffice/BackofficeScaffold';
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

const siteComplianceClient = createApiClient({
  cache: 'no-store',
  idempotencyPrefix: 'admin_site_compliance',
});

const inputClassName =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950';
const labelClassName = 'text-sm font-semibold text-slate-800 dark:text-slate-200';
const hintClassName = 'mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400';
const secondaryButtonClassName =
  'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const primaryButtonClassName =
  'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

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
    <BackofficePageStack>
      <BackofficePrimaryPanel
        eyebrow={copy('网站与审核资料', 'Public site and review')}
        title={copy('网站合规资料', 'Site compliance')}
        description={copy(
          '把现有运行事实整理成可发布资料。只有已发布版本会进入公开页面；草稿、检查结果和凭据不会公开。',
          'Turn runtime facts into publishable disclosures. Only the published version reaches public pages; drafts, checks, and credentials stay private.'
        )}
        actions={
          <>
            <button
              type="button"
              className={primaryButtonClassName}
              disabled={!dirty || Boolean(action)}
              onClick={() => void saveDraft()}
            >
              {action === 'save' ? copy('保存中…', 'Saving…') : copy('保存草稿', 'Save draft')}
            </button>
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
          </>
        }
        summary={
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
        }
      >
        {error ? (
          <BackofficeDiagnosticNotice
            message={error}
            onRetry={() => void loadWorkspace()}
            retryLabel={copy('重新加载', 'Reload')}
          />
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            {notice}
          </p>
        ) : null}
      </BackofficePrimaryPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
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
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <BackofficeSectionPanel>
            <SectionTitle
              title={copy('发布检查', 'Publish checks')}
              description={
                dirty
                  ? copy('先保存草稿，系统才会按最新内容重新检查。', 'Save the draft to revalidate current content.')
                  : copy('以下结果来自最近一次保存。', 'Results are from the latest save.')
              }
            />
            <ValidationList
              title={copy('阻塞项', 'Blockers')}
              empty={copy('没有阻塞项。', 'No blockers.')}
              items={validation?.blockers ?? []}
              tone="error"
            />
            <ValidationList
              title={copy('待确认提醒', 'Warnings')}
              empty={copy('没有提醒。', 'No warnings.')}
              items={validation?.warnings ?? []}
              tone="warning"
            />
          </BackofficeSectionPanel>

          <BackofficeSectionPanel>
            <SectionTitle
              title={copy('QQ 登录审核清单', 'QQ login review')}
              description={copy(
                '这里检查站内可证明项；主体资质与开放平台提交仍需在 QQ互联 控制台完成。',
                'This checks in-product evidence. Submit qualifications in QQ Connect separately.'
              )}
            />
            <ul className="mt-4 space-y-3">
              {workspace.qq_review.items.map((item) => (
                <li key={item.code} className="flex gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={item.ready ? 'text-emerald-600' : 'text-amber-600'}
                  >
                    {item.ready ? '●' : '○'}
                  </span>
                  <span>
                    <strong className="block text-slate-900 dark:text-white">{item.label}</strong>
                    <span className="mt-0.5 block break-all text-xs leading-5 text-slate-500">
                      {item.detail || '—'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <ol className="mt-5 list-decimal space-y-2 border-t border-slate-200 pt-5 pl-5 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:text-slate-400">
              {workspace.qq_review.manual_external_steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </BackofficeSectionPanel>

          <BackofficeSectionPanel>
            <SectionTitle title={copy('版本记录', 'Version history')} />
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">{copy('当前版本', 'Current')}</dt>
                <dd className="mt-1 font-semibold text-slate-950 dark:text-white">
                  {published?.version_number ? `v${published.version_number}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{copy('生效时间', 'Effective')}</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-300">
                  {formatTime(published?.effective_at, zh)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{copy('历史版本', 'History')}</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-300">
                  {workspace.history.length}
                </dd>
              </div>
            </dl>
          </BackofficeSectionPanel>
        </aside>
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

function ValidationList({
  title,
  empty,
  items,
  tone,
}: {
  title: string;
  empty: string;
  items: ValidationItem[];
  tone: 'error' | 'warning';
}) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-bold text-slate-950 dark:text-white">
        {title} · {items.length}
      </h3>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li
              key={`${item.code}-${item.field}-${index}`}
              className={
                tone === 'error'
                  ? 'rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200'
                  : 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-200'
              }
            >
              {item.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{empty}</p>
      )}
    </div>
  );
}
