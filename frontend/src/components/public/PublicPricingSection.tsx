'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';

type TierId = 'free' | 'plus' | 'pro' | 'agency';

interface PublicPlanTier {
  tier_id: TierId;
  label: string;
  availability: 'available' | 'unavailable';
  monthly_points: number | null;
  site_limit: number | null;
  concurrency_limit: number | null;
  batch_item_limit: number | null;
  amount: number | null;
  currency: 'CNY';
  billing_cycle: 'monthly' | null;
  purchase_mode: 'included' | 'self_serve' | 'quote';
  trial_enabled: boolean;
  trial_days: number;
  trial_requires_approval: boolean;
}

interface PublicPlanCatalog {
  tiers: PublicPlanTier[];
  shared_paid_trial: {
    days: number;
    one_per_customer: boolean;
    self_serve_tiers: TierId[];
    approval_required_tiers: TierId[];
  };
}

interface PublicPlanCatalogEnvelope {
  status: string;
  data?: PublicPlanCatalog;
}

const tierOrder: TierId[] = ['free', 'plus', 'pro', 'agency'];

const tierCopy: Record<
  TierId,
  {
    zhPositioning: string;
    enPositioning: string;
    zhAction: string;
    enAction: string;
    href: string;
  }
> = {
  free: {
    zhPositioning: '适合单站点体验托管运行与基础用量记录。',
    enPositioning: 'For one site getting started with hosted runtime and usage evidence.',
    zhAction: '免费开始',
    enAction: 'Start free',
    href: '/portal/register',
  },
  plus: {
    zhPositioning: '适合已经超过免费额度的个人站长。',
    enPositioning: 'For site owners who have outgrown the Free allowance.',
    zhAction: '登录后试用',
    enAction: 'Sign in to try',
    href: '/portal/register?plan=plus',
  },
  pro: {
    zhPositioning: '适合持续使用 AI 工作流的个人与小团队。',
    enPositioning: 'For individuals and small teams running AI workflows regularly.',
    zhAction: '登录后试用',
    enAction: 'Sign in to try',
    href: '/portal/register?plan=pro',
  },
  agency: {
    zhPositioning: '适合多站点或需要更高运行余量的团队。',
    enPositioning: 'For teams that need multi-site coverage and higher runtime headroom.',
    zhAction: '申请方案',
    enAction: 'Request a plan',
    href: '/portal/login?next=/portal/support',
  },
};

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US').format(value);
}

function PlanValue({
  value,
  suffix,
  unavailable,
}: {
  value: number | null;
  suffix: string;
  unavailable: boolean;
}) {
  return (
    <span>
      {unavailable ? '—' : formatNumber(value)}
      {!unavailable && value !== null ? (
        <span className="ml-1 text-slate-500 dark:text-slate-400">{suffix}</span>
      ) : null}
    </span>
  );
}

export function PublicPricingSection() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const [catalog, setCatalog] = useState<PublicPlanCatalog | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      try {
        const response = await fetch('/open/plan-catalog', {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('public plan catalog request failed');
        }
        const payload = (await response.json()) as PublicPlanCatalogEnvelope;
        if (!Array.isArray(payload.data?.tiers) || !payload.data.tiers.length) {
          throw new Error('public plan catalog is empty');
        }
        setCatalog(payload.data);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setLoadFailed(true);
        }
      }
    }

    void loadCatalog();
    return () => controller.abort();
  }, []);

  const tiers = useMemo(() => {
    const byId = new Map(catalog?.tiers.map((tier) => [tier.tier_id, tier]));
    return tierOrder.map((tierId) => ({
      tierId,
      data: byId.get(tierId) || null,
      copy: tierCopy[tierId],
    }));
  }, [catalog]);

  const trialDays = catalog?.shared_paid_trial.days || 14;

  return (
    <section
      id="pricing"
      className="border-b border-slate-200 bg-[#0b1424] text-white dark:border-white/10"
    >
      <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="grid gap-8 border-b border-white/15 pb-10 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#9eb3ff]">
              {zh ? '套餐与权益' : 'Plans & access'}
            </p>
            <h2 className="mt-5 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
              {zh ? '从一站起步，按运行规模升级。' : 'Start with one site. Scale with your runtime.'}
            </h2>
          </div>
          <div className="flex items-end">
            <p className="max-w-2xl text-base leading-8 text-slate-300">
              {zh
                ? '四档套餐使用同一套托管运行边界。差别集中在 AI 额度、站点数量、并发与批量规模。'
                : 'Every plan keeps the same hosted-runtime boundary. The difference is AI allowance, sites, concurrency, and batch scale.'}
            </p>
          </div>
        </div>

        <div
          className="grid border-l border-white/15 sm:grid-cols-2 xl:grid-cols-4"
          aria-label={zh ? '套餐比较' : 'Plan comparison'}
          role="list"
        >
          {tiers.map(({ tierId, data, copy }, index) => {
            const loading = catalog === null && !loadFailed;
            const unavailable = Boolean(
              loadFailed ||
                (catalog !== null && (!data || data.availability !== 'available'))
            );
            const recommended = tierId === 'pro';
            const agency = tierId === 'agency';
            const amount = agency ? null : data?.amount ?? null;

            return (
              <article
                key={tierId}
                role="listitem"
                className={`relative flex flex-col border-b border-r border-white/15 px-6 py-8 transition duration-300 hover:bg-white/[.045] sm:px-7 xl:min-h-[39rem] ${
                  recommended ? 'bg-[#2357ff]/10' : ''
                }`}
              >
                {recommended ? (
                  <span className="absolute right-0 top-0 bg-[#2357ff] px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                    {zh ? '推荐' : 'Recommended'}
                  </span>
                ) : null}
                <p className="font-mono text-xs text-[#9eb3ff]">0{index + 1}</p>
                <h3 className="mt-7 text-3xl font-black">
                  {data?.label || tierId[0].toUpperCase() + tierId.slice(1)}
                </h3>
                <p className="mt-4 min-h-20 text-sm leading-6 text-slate-400">
                  {zh ? copy.zhPositioning : copy.enPositioning}
                </p>

                <div className="mt-7 border-y border-white/15 py-6">
                  {agency ? (
                    <p className="text-3xl font-black">{zh ? '按需报价' : 'Custom quote'}</p>
                  ) : loading ? (
                    <p className="text-sm font-bold text-slate-400">
                      {zh ? '正在读取当前报价…' : 'Loading current offer…'}
                    </p>
                  ) : unavailable || amount === null ? (
                    <p className="text-xl font-black text-slate-300">
                      {zh ? '暂未开放' : 'Not currently available'}
                    </p>
                  ) : (
                    <p className="flex items-end gap-2">
                      <span className="text-sm font-bold text-[#9eb3ff]">¥</span>
                      <span className="text-5xl font-black leading-none">
                        {formatNumber(amount)}
                      </span>
                      <span className="pb-1 text-sm text-slate-400">
                        {zh ? '/ 30 天' : '/ 30 days'}
                      </span>
                    </p>
                  )}
                </div>

                <dl className="mt-6 divide-y divide-white/10 text-sm">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-400">{zh ? 'AI 额度' : 'AI credits'}</dt>
                    <dd className="font-bold">
                      {agency && (!data || unavailable) ? (
                        zh ? '按方案' : 'Custom'
                      ) : (
                        <PlanValue
                          value={data?.monthly_points ?? null}
                          suffix={zh ? '/月' : '/mo'}
                          unavailable={loading || unavailable}
                        />
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-400">{zh ? '连接站点' : 'Connected sites'}</dt>
                    <dd className="font-bold">
                      {agency && (!data || unavailable) ? (
                        zh ? '多站点' : 'Multi-site'
                      ) : (
                        <PlanValue
                          value={data?.site_limit ?? null}
                          suffix={zh ? '个' : 'sites'}
                          unavailable={loading || unavailable}
                        />
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-400">{zh ? '同时运行' : 'Concurrent runs'}</dt>
                    <dd className="font-bold">
                      {agency && (!data || unavailable) ? (
                        zh ? '按方案' : 'Custom'
                      ) : (
                        <PlanValue
                          value={data?.concurrency_limit ?? null}
                          suffix={zh ? '项' : 'runs'}
                          unavailable={loading || unavailable}
                        />
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-400">{zh ? '单批上限' : 'Batch limit'}</dt>
                    <dd className="font-bold">
                      {agency && (!data || unavailable) ? (
                        zh ? '按方案' : 'Custom'
                      ) : (
                        <PlanValue
                          value={data?.batch_item_limit ?? null}
                          suffix={zh ? '项' : 'items'}
                          unavailable={loading || unavailable}
                        />
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-auto pt-8">
                  <Link
                    href={copy.href}
                    className={`flex h-12 items-center justify-between border px-4 text-sm font-black transition ${
                      recommended
                        ? 'border-[#2357ff] bg-[#2357ff] text-white hover:border-[#4773ff] hover:bg-[#4773ff]'
                        : 'border-white/25 text-white hover:border-white hover:bg-white/5'
                    }`}
                  >
                    <span>{zh ? copy.zhAction : copy.enAction}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        <div className="grid gap-5 border-x border-b border-white/15 px-6 py-6 text-sm leading-6 text-slate-400 sm:px-7 md:grid-cols-[1fr_auto] md:items-center">
          <p>
            {zh
              ? `Plus、Pro 与 Agency 共享一次 ${trialDays} 天付费套餐试用资格；Agency 试用和报价需要审核。`
              : `Plus, Pro, and Agency share one ${trialDays}-day paid-plan trial. Agency trials and quotes require approval.`}
          </p>
          <p className="font-bold text-slate-300">
            {zh
              ? '实际价格与权益以当前已发布方案为准'
              : 'Current published offers and plan versions are authoritative'}
          </p>
        </div>
      </div>
    </section>
  );
}
