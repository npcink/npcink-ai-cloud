'use client';

import Link from 'next/link';
import { useLocale } from '@/contexts/LocaleContext';

type PackageRow = {
  packageName: string;
  sites: string;
  tasksPerMonth: string;
  batchLimit: string;
  concurrency: string;
  geoReports: string;
  auditRetention: string;
  supportLevel: string;
  bestFor: string;
};

type ChoiceItem = {
  title: string;
  description: string;
};

export default function PackagesPage() {
  const { locale } = useLocale();

  const copy = {
    en: {
      eyebrow: 'Packages',
      title: 'Choose the package that matches your scale',
      description:
        'Starter, Pro, Agency, and Enterprise share the same core product surface. The real differences come from site count, task volume, concurrency, batch ceiling, and support level.',
      notice:
        'This is a read-only comparison page. Package changes remain operator-managed and do not happen through a self-serve transaction flow.',
      columns: ['Package', 'Sites', 'Tasks/mo', 'Batch limit', 'Concurrency', 'GEO reports', 'Audit retention', 'Support', 'Best for'],
      rows: [
        {
          packageName: 'Starter',
          sites: '1',
          tasksPerMonth: '500',
          batchLimit: '0',
          concurrency: '1 active run',
          geoReports: '3/mo',
          auditRetention: '7 days',
          supportLevel: 'Community',
          bestFor: 'Single-site trial, small GEO/product tasks',
        },
        {
          packageName: 'Pro',
          sites: '1',
          tasksPerMonth: '10,000',
          batchLimit: '10',
          concurrency: '2 active runs',
          geoReports: '20/mo',
          auditRetention: '30 days',
          supportLevel: 'Email',
          bestFor: 'Daily content / GEO / Woo product ops',
        },
        {
          packageName: 'Agency',
          sites: '10',
          tasksPerMonth: '50,000',
          batchLimit: '100',
          concurrency: '6 active runs',
          geoReports: '100/mo',
          auditRetention: '90 days',
          supportLevel: 'Priority',
          bestFor: 'Multi-site, bulk products, multi-language, team collaboration',
        },
        {
          packageName: 'Enterprise',
          sites: 'Unlimited',
          tasksPerMonth: 'Custom',
          batchLimit: 'Custom',
          concurrency: 'Custom',
          geoReports: 'Unlimited',
          auditRetention: '1 year+',
          supportLevel: 'Dedicated SLA',
          bestFor: 'BYOM, private models, audit, SLA, compliance support',
        },
      ] as PackageRow[],
      pointsFootnote:
        'Points shown are approximate runtime consumption units for reference only. Actual entitlements are based on task volume, site count, and package tier.',
      chooseTitle: 'How to choose',
      choices: [
        {
          title: 'Starter',
          description: 'Single-site trial with conservative limits. Best for evaluating hosted runtime on one WordPress site before scaling.',
        },
        {
          title: 'Pro',
          description: 'Steady daily operations for content, GEO, and WooCommerce product workflows on a single site.',
        },
        {
          title: 'Agency',
          description: 'Multi-site operations with higher concurrency, batch limits, and team collaboration across many properties.',
        },
        {
          title: 'Enterprise',
          description: 'Custom deployments with BYOM, private models, extended audit retention, and dedicated SLA compliance support.',
        },
      ] as ChoiceItem[],
      rulesTitle: 'What stays the same',
      rules: [
        'Core capability entry stays shared across all packages.',
        'Package differences should be read through site count, task volume, concurrency, batch ceiling, and support level—not through sales-front feature gating.',
        'If you are between two packages, start by checking your current usage and then ask for operator follow-up.',
      ],
      currentPackage: 'Review current package posture',
      topUpGuide: 'Review top-up guidance',
      requestUpgrade: 'Ask an operator to review package fit',
    },
    'zh-CN': {
      eyebrow: '套餐',
      title: '选择与你规模匹配的套餐',
      description:
        'Starter、Pro、Agency、Enterprise 共享同一套核心产品面。真正的差异主要来自站点数、任务量、并发、批量上限和支持等级。',
      notice:
        '这是一张只读对比页。套餐调整仍由 operator-managed 处理，不通过自助交易流完成。',
      columns: ['套餐', '站点数', '任务/月', '批量上限', '并发', 'GEO 报告', '审计保留', '支持', '最适合'],
      rows: [
        {
          packageName: 'Starter',
          sites: '1',
          tasksPerMonth: '500',
          batchLimit: '0',
          concurrency: '1 个活跃 run',
          geoReports: '3/月',
          auditRetention: '7 天',
          supportLevel: '社区',
          bestFor: '单站点试用、少量 GEO/商品任务',
        },
        {
          packageName: 'Pro',
          sites: '1',
          tasksPerMonth: '10,000',
          batchLimit: '10',
          concurrency: '2 个活跃 run',
          geoReports: '20/月',
          auditRetention: '30 天',
          supportLevel: '邮件',
          bestFor: '日常内容 / GEO / Woo 商品运营',
        },
        {
          packageName: 'Agency',
          sites: '10',
          tasksPerMonth: '50,000',
          batchLimit: '100',
          concurrency: '6 个活跃 run',
          geoReports: '100/月',
          auditRetention: '90 天',
          supportLevel: '优先',
          bestFor: '多站点、批量商品、多语言、团队协作',
        },
        {
          packageName: 'Enterprise',
          sites: '不限',
          tasksPerMonth: '定制',
          batchLimit: '定制',
          concurrency: '定制',
          geoReports: '不限',
          auditRetention: '1 年+',
          supportLevel: '专属 SLA',
          bestFor: 'BYOM、私有模型、审计、SLA、合规支持',
        },
      ] as PackageRow[],
      pointsFootnote:
        '点数仅为近似运行时消耗参考单位，不作为主收费锚点。实际权益以任务量、站点数和套餐层级为准。',
      chooseTitle: '怎么选',
      choices: [
        {
          title: 'Starter',
          description: '单站点试用，限制较保守。适合在单个 WordPress 站点上评估托管运行，再决定是否扩容。',
        },
        {
          title: 'Pro',
          description: '适合单站点上稳定日常运营的内容、GEO 与 WooCommerce 商品工作流。',
        },
        {
          title: 'Agency',
          description: '多站点运营，具备更高并发、批量上限，以及跨多个资产的团队协作能力。',
        },
        {
          title: 'Enterprise',
          description: '定制部署，支持 BYOM、私有模型、延长审计保留期，以及专属 SLA 合规支持。',
        },
      ] as ChoiceItem[],
      rulesTitle: '哪些东西不变',
      rules: [
        '核心能力入口在各套餐之间保持共享。',
        '套餐差异应该通过站点数、任务量、并发、批量上限和支持等级来理解，而不是销售前台式功能割裂。',
        '如果你处在两个套餐之间，先看当前使用情况，再进入 operator 跟进。',
      ],
      currentPackage: '查看当前套餐状态',
      topUpGuide: '查看加量说明',
      requestUpgrade: '请 operator 评估套餐是否需要调整',
    },
    'zh-TW': {
      eyebrow: '方案',
      title: '選擇與你規模匹配的方案',
      description:
        'Starter、Pro、Agency、Enterprise 共用同一套核心產品面。真正差異主要來自站點數、任務量、併發、批次上限和支援等級。',
      notice:
        '這是一張唯讀對比頁。方案調整仍由 operator-managed 處理，不透過自助交易流完成。',
      columns: ['方案', '站點數', '任務/月', '批次上限', '併發', 'GEO 報告', '稽核保留', '支援', '最適合'],
      rows: [
        {
          packageName: 'Starter',
          sites: '1',
          tasksPerMonth: '500',
          batchLimit: '0',
          concurrency: '1 個活躍 run',
          geoReports: '3/月',
          auditRetention: '7 天',
          supportLevel: '社區',
          bestFor: '單站點試用、少量 GEO/商品任務',
        },
        {
          packageName: 'Pro',
          sites: '1',
          tasksPerMonth: '10,000',
          batchLimit: '10',
          concurrency: '2 個活躍 run',
          geoReports: '20/月',
          auditRetention: '30 天',
          supportLevel: '郵件',
          bestFor: '日常內容 / GEO / Woo 商品營運',
        },
        {
          packageName: 'Agency',
          sites: '10',
          tasksPerMonth: '50,000',
          batchLimit: '100',
          concurrency: '6 個活躍 run',
          geoReports: '100/月',
          auditRetention: '90 天',
          supportLevel: '優先',
          bestFor: '多站點、批量商品、多語言、團隊協作',
        },
        {
          packageName: 'Enterprise',
          sites: '不限',
          tasksPerMonth: '定制',
          batchLimit: '定制',
          concurrency: '定制',
          geoReports: '不限',
          auditRetention: '1 年+',
          supportLevel: '專屬 SLA',
          bestFor: 'BYOM、私有模型、稽核、SLA、合規支援',
        },
      ] as PackageRow[],
      pointsFootnote:
        '點數僅為近似執行時消耗參考單位，不作為主收費錨點。實際權益以任務量、站點數和方案層級為準。',
      chooseTitle: '怎麼選',
      choices: [
        {
          title: 'Starter',
          description: '單站點試用，限制較保守。適合在單個 WordPress 站點上評估託管執行，再決定是否擴容。',
        },
        {
          title: 'Pro',
          description: '適合單站點上穩定日常營運的內容、GEO 與 WooCommerce 商品工作流。',
        },
        {
          title: 'Agency',
          description: '多站點營運，具備更高併發、批次上限，以及跨多個資產的團隊協作能力。',
        },
        {
          title: 'Enterprise',
          description: '定制部署，支援 BYOM、私有模型、延長稽核保留期，以及專屬 SLA 合規支援。',
        },
      ] as ChoiceItem[],
      rulesTitle: '哪些東西不變',
      rules: [
        '核心能力入口在各方案之間保持共享。',
        '方案差異應透過站點數、任務量、併發、批次上限和支援等級理解，而不是銷售前台式功能切割。',
        '如果你介於兩個方案之間，先看目前使用情況，再進入 operator 跟進。',
      ],
      currentPackage: '查看目前方案狀態',
      topUpGuide: '查看加量說明',
      requestUpgrade: '請 operator 評估方案是否需要調整',
    },
  }[locale];

  return (
    <div className="flex flex-col items-center pb-16">
      <section className="w-full py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="space-y-5">
            <div className="brand-chip">{copy.eyebrow}</div>
            <h1
              data-display="true"
              className="max-w-5xl text-5xl font-semibold leading-[0.95] text-slate-950 dark:text-white sm:text-6xl"
            >
              {copy.title}
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              {copy.description}
            </p>
            <div className="inline-flex max-w-3xl rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-100">
              {copy.notice}
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/portal/billing" className="btn btn-primary">
                {copy.currentPackage}
              </Link>
              <Link href="/top-up-packs" className="btn btn-secondary">
                {copy.topUpGuide}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-6">
        <div className="container mx-auto px-4">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-950/55">
            <div className="grid grid-cols-1 gap-px bg-slate-200/80 dark:bg-slate-800 lg:grid-cols-9">
              {copy.columns.map((column) => (
                <div
                  key={column}
                  className="bg-slate-50 px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:bg-slate-900/90 dark:text-slate-400"
                >
                  {column}
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
              {copy.rows.map((row) => (
                <div
                  key={row.packageName}
                  className="grid grid-cols-1 gap-px bg-slate-200/80 dark:bg-slate-800 lg:grid-cols-9"
                >
                  <div className="bg-white px-5 py-5 dark:bg-slate-950/55">
                    <div className="text-lg font-semibold text-slate-950 dark:text-white">{row.packageName}</div>
                  </div>
                  <div className="bg-white px-5 py-5 text-sm text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                    {row.sites}
                  </div>
                  <div className="bg-white px-5 py-5 text-sm text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                    {row.tasksPerMonth}
                  </div>
                  <div className="bg-white px-5 py-5 text-sm text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                    {row.batchLimit}
                  </div>
                  <div className="bg-white px-5 py-5 text-sm text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                    {row.concurrency}
                  </div>
                  <div className="bg-white px-5 py-5 text-sm text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                    {row.geoReports}
                  </div>
                  <div className="bg-white px-5 py-5 text-sm text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                    {row.auditRetention}
                  </div>
                  <div className="bg-white px-5 py-5 text-sm text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                    {row.supportLevel}
                  </div>
                  <div className="bg-white px-5 py-5 text-sm leading-6 text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                    {row.bestFor}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            {copy.pointsFootnote}
          </p>
        </div>
      </section>

      <section className="w-full py-10">
        <div className="container mx-auto px-4">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="surface-panel rounded-[1.7rem] p-6">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {copy.chooseTitle}
              </p>
              <div className="mt-4 grid gap-3">
                {copy.choices.map((choice) => (
                  <div
                    key={choice.title}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <div className="text-base font-semibold text-slate-950 dark:text-white">{choice.title}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                      {choice.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="surface-panel rounded-[1.7rem] p-6">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {copy.rulesTitle}
              </p>
              <div className="mt-4 space-y-3">
                {copy.rules.map((rule) => (
                  <div
                    key={rule}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
                  >
                    {rule}
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/portal/billing" className="btn btn-secondary">
                  {copy.currentPackage}
                </Link>
                <Link href="/top-up-packs" className="btn btn-secondary">
                  {copy.topUpGuide}
                </Link>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                  {copy.requestUpgrade}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
