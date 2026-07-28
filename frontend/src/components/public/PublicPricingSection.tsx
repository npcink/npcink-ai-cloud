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

interface TierCopy {
  zhPositioning: string;
  enPositioning: string;
  zhAction: string;
  enAction: string;
  href: string;
}

interface TierView {
  tierId: TierId;
  data: PublicPlanTier | null;
  copy: TierCopy;
}

const tierOrder: TierId[] = ['free', 'plus', 'pro', 'agency'];

const tierCopy: Record<TierId, TierCopy> = {
  free: {
    zhPositioning: '适合一个站点体验托管运行。',
    enPositioning: 'For one site trying hosted execution.',
    zhAction: '免费开始',
    enAction: 'Start free',
    href: '/portal/register',
  },
  plus: {
    zhPositioning: '适合稳定使用 AI 的个人站长。',
    enPositioning: 'For site owners using AI consistently.',
    zhAction: '选择 Plus',
    enAction: 'Choose Plus',
    href: '/portal/register?plan=plus',
  },
  pro: {
    zhPositioning: '适合多站点使用的个人与小团队。',
    enPositioning: 'For individuals and small teams using multiple sites.',
    zhAction: '选择 Pro',
    enAction: 'Choose Pro',
    href: '/portal/register?plan=pro',
  },
  agency: {
    zhPositioning: '适合需要更高运行余量的团队。',
    enPositioning: 'For teams needing higher runtime headroom.',
    zhAction: '申请方案',
    enAction: 'Request a plan',
    href: '/portal/login?redirect=%2Fportal%2Fsupport',
  },
};

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US').format(value);
}

function planLabel(view: TierView): string {
  return view.data?.label || view.tierId[0].toUpperCase() + view.tierId.slice(1);
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
        <span className="ml-1 text-slate-400">{suffix}</span>
      ) : null}
    </span>
  );
}

function PlanPrice({
  agency,
  amount,
  loading,
  unavailable,
  zh,
  compact = false,
}: {
  agency: boolean;
  amount: number | null;
  loading: boolean;
  unavailable: boolean;
  zh: boolean;
  compact?: boolean;
}) {
  if (agency) {
    return <span className={compact ? 'text-lg font-black' : 'text-3xl font-black'}>{zh ? '按需报价' : 'Custom quote'}</span>;
  }
  if (loading) {
    return <span className="text-sm font-bold text-slate-400">{zh ? '正在读取…' : 'Loading…'}</span>;
  }
  if (unavailable || amount === null) {
    return <span className="text-sm font-black text-slate-300">{zh ? '暂未开放' : 'Not available'}</span>;
  }
  if (compact) {
    return (
      <span className="font-black">
        ¥{formatNumber(amount)}
        <span className="ml-1 text-xs font-medium text-slate-400">{zh ? '/30 天' : '/30 days'}</span>
      </span>
    );
  }
  return (
    <span className="flex items-end gap-2">
      <span className="text-sm font-bold text-[#9eb3ff]">¥</span>
      <span className="text-5xl font-black leading-none">{formatNumber(amount)}</span>
      <span className="pb-1 text-sm text-slate-400">{zh ? '/ 30 天' : '/ 30 days'}</span>
    </span>
  );
}

function PlanDetails({
  agency,
  data,
  loading,
  unavailable,
  zh,
}: {
  agency: boolean;
  data: PublicPlanTier | null;
  loading: boolean;
  unavailable: boolean;
  zh: boolean;
}) {
  return (
    <dl className="divide-y divide-white/10 text-sm">
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-slate-400">{zh ? '每月 AI 用量' : 'Monthly AI allowance'}</dt>
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
        <dt className="text-slate-400">{zh ? '可连接站点' : 'Connected sites'}</dt>
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
        <dt className="text-slate-400">{zh ? '同时处理任务' : 'Concurrent runs'}</dt>
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
        <dt className="text-slate-400">{zh ? '单次批量数量' : 'Batch size'}</dt>
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
  );
}

function PlanAction({
  copy,
  recommended,
  unavailable,
  zh,
}: {
  copy: TierCopy;
  recommended: boolean;
  unavailable: boolean;
  zh: boolean;
}) {
  if (unavailable) {
    return (
      <span
        aria-disabled="true"
        className="flex h-12 items-center border border-white/15 px-4 text-sm font-black text-slate-500"
      >
        {zh ? '暂未开放' : 'Not available'}
      </span>
    );
  }

  return (
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
  );
}

export function PublicPricingSection() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const [catalog, setCatalog] = useState<PublicPlanCatalog | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expandedTier, setExpandedTier] = useState<TierId | null>('pro');

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

  const tiers = useMemo<TierView[]>(() => {
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
      data-home-pricing
      className="border-b border-slate-200 bg-[#0b1424] text-white dark:border-white/10"
    >
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-6 border-b border-white/15 pb-8 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#9eb3ff]">
              {zh ? '套餐与权益' : 'Plans & access'}
            </p>
            <h2 className="mt-5 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
              {zh ? '从一个站点开始，按使用规模升级。' : 'Start with one site. Scale as usage grows.'}
            </h2>
          </div>
          <div className="flex items-end">
            <p className="max-w-2xl text-base leading-8 text-slate-300">
              {zh
                ? '先看适合谁和每月价格，再比较站点数、同时任务和单次批量数量。'
                : 'Start with fit and monthly price, then compare sites, concurrent runs, and batch size.'}
            </p>
          </div>
        </div>

        <div
          data-plan-comparison="desktop"
          className="hidden border-l border-white/15 md:grid md:grid-cols-2 xl:grid-cols-4"
          aria-label={zh ? '套餐比较' : 'Plan comparison'}
          role="list"
        >
          {tiers.map((view, index) => {
            const { tierId, data, copy } = view;
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
                data-plan-tier={tierId}
                role="listitem"
                className={`relative flex flex-col border-b border-r border-white/15 px-6 py-7 transition duration-300 hover:bg-white/[.045] xl:min-h-[34rem] ${
                  recommended ? 'bg-[#2357ff]/10' : ''
                }`}
              >
                {recommended ? (
                  <span className="absolute right-0 top-0 bg-[#2357ff] px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                    {zh ? '推荐' : 'Recommended'}
                  </span>
                ) : null}
                <p className="font-mono text-xs text-[#9eb3ff]">0{index + 1}</p>
                <h3 className="mt-5 text-3xl font-black">{planLabel(view)}</h3>
                <p className="mt-3 min-h-16 text-sm leading-6 text-slate-400">
                  {zh ? copy.zhPositioning : copy.enPositioning}
                </p>
                <div className="mt-5 border-y border-white/15 py-5">
                  <PlanPrice
                    agency={agency}
                    amount={amount}
                    loading={loading}
                    unavailable={unavailable}
                    zh={zh}
                  />
                </div>
                <div className="mt-4">
                  <PlanDetails
                    agency={agency}
                    data={data}
                    loading={loading}
                    unavailable={unavailable}
                    zh={zh}
                  />
                </div>
                <div className="mt-auto pt-6">
                  <PlanAction
                    copy={copy}
                    recommended={recommended}
                    unavailable={unavailable && !agency}
                    zh={zh}
                  />
                </div>
              </article>
            );
          })}
        </div>

        <div
          data-plan-comparison="mobile"
          className="border-l border-t border-white/15 md:hidden"
          aria-label={zh ? '移动端套餐比较' : 'Mobile plan comparison'}
          role="list"
        >
          {tiers.map((view, index) => {
            const { tierId, data, copy } = view;
            const loading = catalog === null && !loadFailed;
            const unavailable = Boolean(
              loadFailed ||
                (catalog !== null && (!data || data.availability !== 'available'))
            );
            const recommended = tierId === 'pro';
            const agency = tierId === 'agency';
            const amount = agency ? null : data?.amount ?? null;
            const expanded = expandedTier === tierId;
            const panelId = `mobile-plan-${tierId}`;

            return (
              <article
                key={tierId}
                data-plan-tier={tierId}
                role="listitem"
                className="border-b border-r border-white/15"
              >
                <button
                  type="button"
                  aria-label={zh ? `${planLabel(view)} 套餐详情` : `${planLabel(view)} plan details`}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setExpandedTier(expanded ? null : tierId)}
                  className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-5 text-left transition hover:bg-white/[.045] ${
                    recommended ? 'bg-[#2357ff]/10' : ''
                  }`}
                >
                  <span className="font-mono text-xs text-[#9eb3ff]">0{index + 1}</span>
                  <span>
                    <span className="flex items-center gap-2 text-xl font-black">
                      {planLabel(view)}
                      {recommended ? (
                        <span className="bg-[#2357ff] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-white">
                          {zh ? '推荐' : 'Recommended'}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-400">
                      {zh ? copy.zhPositioning : copy.enPositioning}
                    </span>
                  </span>
                  <span className="text-right">
                    <PlanPrice
                      agency={agency}
                      amount={amount}
                      loading={loading}
                      unavailable={unavailable}
                      zh={zh}
                      compact
                    />
                    <span className="mt-2 block text-xs text-[#9eb3ff]" aria-hidden="true">
                      {expanded ? '−' : '+'}
                    </span>
                  </span>
                </button>
                {expanded ? (
                  <div
                    id={panelId}
                    className="motion-safe:animate-fade-in border-t border-white/10 px-5 pb-6 pt-3"
                  >
                    <PlanDetails
                      agency={agency}
                      data={data}
                      loading={loading}
                      unavailable={unavailable}
                      zh={zh}
                    />
                    <div className="pt-5">
                      <PlanAction
                        copy={copy}
                        recommended={recommended}
                        unavailable={unavailable && !agency}
                        zh={zh}
                      />
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="grid gap-4 border-x border-b border-white/15 px-5 py-5 text-sm leading-6 text-slate-400 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-2">
            <p data-plan-entitlement-notice>
              {zh
                ? 'Free 服务和额度归 Cloud 账户，不随站点转移；更换账户连接时，必须先释放站点并遵守 Cloud 显示的冷却期。'
                : 'Free service and credits belong to the Cloud account and do not move with a site. Connecting the site to another account requires release and the cooldown shown by Cloud.'}
            </p>
            <p>
              {zh
                ? `Plus、Pro 与 Agency 共享一次 ${trialDays} 天付费套餐试用资格；Agency 需要审核。`
                : `Plus, Pro, and Agency share one ${trialDays}-day paid-plan trial. Agency requires approval.`}
            </p>
          </div>
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
