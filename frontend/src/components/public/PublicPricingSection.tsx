'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';

type TierId = 'free' | 'plus' | 'pro' | 'agency';
type PlanRightKey =
  | 'monthly_points'
  | 'site_limit'
  | 'knowledge_article_limit'
  | 'concurrency_limit'
  | 'batch_item_limit';

interface PlanComparisonRight {
  state: 'limited' | 'unlimited' | 'not_included' | 'unconfigured';
  value: number | null;
}

interface PublicPlanTier {
  tier_id: TierId;
  label: string;
  availability: 'available' | 'unavailable';
  comparison_rights: Record<PlanRightKey, PlanComparisonRight>;
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
    zhPositioning: '适合多站点个人与小团队。',
    enPositioning: 'For individuals and small teams using multiple sites.',
    zhAction: '选择 Pro',
    enAction: 'Choose Pro',
    href: '/portal/register?plan=pro',
  },
  agency: {
    zhPositioning: '适合需要更多运行余量的团队。',
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
  right,
  suffix,
  singularSuffix,
  unavailable,
  zh,
}: {
  right: PlanComparisonRight | undefined;
  suffix: string;
  singularSuffix?: string;
  unavailable: boolean;
  zh: boolean;
}) {
  if (unavailable) return <span>—</span>;
  if (!right || right.state === 'unconfigured') {
    return <span>{zh ? '待确认' : 'To confirm'}</span>;
  }
  if (right.state === 'unlimited') {
    return <span>{zh ? '不限' : 'Unlimited'}</span>;
  }
  if (right.state === 'not_included') {
    return <span>{zh ? '未包含' : 'Not included'}</span>;
  }
  return (
    <span>
      {formatNumber(right.value)}
      {right.value !== null ? (
        <>
          {' '}
          <span className="text-slate-400">
            {!zh && right.value === 1 && singularSuffix ? singularSuffix : suffix}
          </span>
        </>
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
  if (loading) {
    return <span className="text-sm font-bold text-slate-400">{zh ? '正在读取…' : 'Loading…'}</span>;
  }
  if (agency) {
    return <span className={compact ? 'text-lg font-black' : 'text-3xl font-black'}>{zh ? '按需报价' : 'Custom quote'}</span>;
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
  const showAgencyFallback = agency && !loading && (!data || unavailable);

  return (
    <dl className="divide-y divide-white/10 text-sm">
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-slate-400">{zh ? '每月 AI 用量' : 'Monthly AI allowance'}</dt>
        <dd className="font-bold">
          {showAgencyFallback ? (
            zh ? '按方案' : 'Custom'
          ) : (
            <PlanValue
              right={data?.comparison_rights?.monthly_points}
              suffix={zh ? '/月' : '/mo'}
              unavailable={loading || unavailable}
              zh={zh}
            />
          )}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-slate-400">{zh ? '可连接站点' : 'Connected sites'}</dt>
        <dd className="font-bold">
          {showAgencyFallback ? (
            zh ? '多站点' : 'Multi-site'
          ) : (
            <PlanValue
              right={data?.comparison_rights?.site_limit}
              suffix={zh ? '个' : 'sites'}
              singularSuffix="site"
              unavailable={loading || unavailable}
              zh={zh}
            />
          )}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-slate-400">{zh ? '知识库文章' : 'Knowledge articles'}</dt>
        <dd className="font-bold">
          {showAgencyFallback ? (
            zh ? '按方案' : 'Custom'
          ) : (
            <PlanValue
              right={data?.comparison_rights?.knowledge_article_limit}
              suffix={zh ? '篇' : 'articles'}
              singularSuffix="article"
              unavailable={loading || unavailable}
              zh={zh}
            />
          )}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-slate-400">{zh ? '同时处理任务' : 'Concurrent runs'}</dt>
        <dd className="font-bold">
          {showAgencyFallback ? (
            zh ? '按方案' : 'Custom'
          ) : (
            <PlanValue
              right={data?.comparison_rights?.concurrency_limit}
              suffix={zh ? '项' : 'runs'}
              singularSuffix="run"
              unavailable={loading || unavailable}
              zh={zh}
            />
          )}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-slate-400">{zh ? '单次批量数量' : 'Batch size'}</dt>
        <dd className="font-bold">
          {showAgencyFallback ? (
            zh ? '按方案' : 'Custom'
          ) : (
            <PlanValue
              right={data?.comparison_rights?.batch_item_limit}
              suffix={zh ? '项' : 'items'}
              singularSuffix="item"
              unavailable={loading || unavailable}
              zh={zh}
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
  loading,
  unavailable,
  zh,
}: {
  copy: TierCopy;
  recommended: boolean;
  loading: boolean;
  unavailable: boolean;
  zh: boolean;
}) {
  if (loading || unavailable) {
    return (
      <span
        aria-disabled="true"
        className="flex h-12 items-center border border-white/15 px-4 text-sm font-black text-slate-500"
      >
        {loading
          ? zh ? '正在读取…' : 'Loading…'
          : zh ? '暂未开放' : 'Not available'}
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
  const [catalogRetryVersion, setCatalogRetryVersion] = useState(0);
  const [expandedTier, setExpandedTier] = useState<TierId | null>('pro');

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      setLoadFailed(false);
      try {
        const response = await fetch('/open/plan-catalog', {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
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
  }, [catalogRetryVersion]);

  const tiers = useMemo<TierView[]>(() => {
    const byId = new Map(catalog?.tiers.map((tier) => [tier.tier_id, tier]));
    return tierOrder.map((tierId) => ({
      tierId,
      data: byId.get(tierId) || null,
      copy: tierCopy[tierId],
    }));
  }, [catalog]);

  return (
    <section
      id="pricing"
      data-home-pricing
      className="border-b border-slate-200 bg-[#0b1424] text-white dark:border-white/10"
    >
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-6 border-b border-white/15 pb-8 xl:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#9eb3ff]">
              {zh ? '套餐与权益' : 'Plans & access'}
            </p>
            <h2 className="mt-5 max-w-xl text-4xl font-black leading-[1.12] tracking-[-0.035em]">
              {zh ? '从一个站点开始，按需升级。' : 'Start with one site. Scale as needed.'}
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

        {loadFailed ? (
          <div
            className="mt-6 flex flex-col gap-3 border border-amber-300/35 bg-amber-300/10 px-5 py-4 text-sm text-amber-50 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div>
              <p className="font-bold">
                {zh ? '套餐信息暂时加载失败' : 'Plan information could not be loaded'}
              </p>
              <p className="mt-1 text-amber-100/80">
                {zh
                  ? '当前无法确认价格与权益，购买入口已暂时停用。'
                  : 'Current prices and access could not be confirmed, so purchase actions are temporarily disabled.'}
              </p>
            </div>
            <button
              type="button"
              className="h-11 shrink-0 border border-amber-100/45 px-4 font-bold text-white transition hover:bg-white/10"
              onClick={() => setCatalogRetryVersion((current) => current + 1)}
            >
              {zh ? '重新加载套餐' : 'Reload plans'}
            </button>
          </div>
        ) : null}

        <div
          data-plan-comparison="desktop"
          className={`${loadFailed ? 'mt-6 ' : ''}hidden border-l border-white/15 md:grid md:grid-cols-2 xl:grid-cols-4`}
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
                    loading={loading}
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
          className={`${loadFailed ? 'mt-6 ' : ''}border-l border-t border-white/15 md:hidden`}
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
                  className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-5 text-left transition hover:bg-white/[.045] ${
                    recommended ? 'bg-[#2357ff]/10' : ''
                  }`}
                >
                  <span className="font-mono text-xs text-[#9eb3ff]">0{index + 1}</span>
                  <span className="flex items-center gap-2 text-xl font-black">
                    {planLabel(view)}
                    {recommended ? (
                      <span className="bg-[#2357ff] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-white">
                        {zh ? '推荐' : 'Recommended'}
                      </span>
                    ) : null}
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
                  <span className="col-span-2 col-start-2 block text-sm leading-6 text-slate-400 [text-wrap:pretty]">
                    {zh ? copy.zhPositioning : copy.enPositioning}
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
                        loading={loading}
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

        <div className="grid gap-4 border-x border-b border-white/15 px-5 py-5 text-sm leading-6 text-slate-400 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="space-y-2">
            <p data-plan-entitlement-notice className="[text-wrap:pretty]">
              {zh
                ? 'Free 服务和额度归 Cloud 账户，不随站点转移；更换账户连接时，必须先释放站点并遵守 Cloud 显示的冷却期。'
                : 'Free service and credits belong to the Cloud account and do not move with a site. Connecting the site to another account requires release and the cooldown shown by Cloud.'}
            </p>
            {catalog ? (
              <p className="[text-wrap:pretty]">
                {zh
                  ? `Plus、Pro 与 Agency 共享一次 ${catalog.shared_paid_trial.days} 天付费套餐试用资格；Agency 需要审核。`
                  : `Plus, Pro, and Agency share one ${catalog.shared_paid_trial.days}-day paid-plan trial. Agency requires approval.`}
              </p>
            ) : null}
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
