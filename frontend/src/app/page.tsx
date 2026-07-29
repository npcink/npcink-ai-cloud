'use client';

import Link from 'next/link';
import { PublicPricingSection } from '@/components/public/PublicPricingSection';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';
import { PublicStatusSummary } from '@/components/public/PublicStatusSummary';
import { useLocale } from '@/contexts/LocaleContext';

const trustFacts = [
  {
    index: '01',
    zhTitle: '模型密钥不落站点',
    enTitle: 'No model keys in your site',
    zh: '模型调用与提供方适配由 Cloud 托管。',
    en: 'Cloud hosts model calls and provider adapters.',
  },
  {
    index: '02',
    zhTitle: '每次用量有据可查',
    enTitle: 'Usage stays reviewable',
    zh: '套餐、站点用量与运行记录集中核对。',
    en: 'Review plan, site usage, and runtime records together.',
  },
  {
    index: '03',
    zhTitle: '发布必须回到站点确认',
    enTitle: 'Publishing stays in WordPress',
    zh: 'Cloud 返回结果，不绕过人工确认自动发布。',
    en: 'Cloud returns results without bypassing human approval.',
  },
];

export default function HomePage() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';

  return (
    <PublicSiteShell>
      <main id="main-content" tabIndex={-1}>
        <section
          data-home-hero
          className="relative overflow-hidden border-b border-slate-200 bg-[#0b1424] text-white dark:border-white/10"
        >
          <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:56px_56px]" />
          <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-[#2357ff]/35 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-12 sm:py-16 lg:min-h-[610px] lg:grid-cols-[1.2fr_.8fr] lg:px-8 lg:py-20">
            <div>
              <p className="public-home-enter text-xs font-bold uppercase tracking-[0.3em] text-[#9eb3ff]">
                WordPress × Hosted AI Runtime
              </p>
              <h1 className="public-home-enter public-home-enter-delay-1 mt-6 max-w-4xl text-[2.65rem] font-black leading-[1.08] tracking-[-0.04em] sm:text-5xl xl:text-[3.5rem]">
                {zh ? (
                  <>
                    <span className="block">让 AI 在云端运行，</span>
                    <span className="block text-[#9eb3ff]">控制权仍在 WordPress。</span>
                  </>
                ) : (
                  <>
                    Run AI in the cloud.
                    <span className="block text-[#9eb3ff]">Keep control in WordPress.</span>
                  </>
                )}
              </h1>
              <p className="public-home-enter public-home-enter-delay-2 mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                {zh
                  ? '托管模型运行、用量记录和服务诊断；内容、配置与最终发布仍由您的 WordPress 站点决定。'
                  : 'Hosted model execution, usage evidence, and service diagnostics—while content, settings, and final publishing remain in WordPress.'}
              </p>
              <div className="public-home-enter public-home-enter-delay-3 mt-8 flex flex-wrap gap-3">
                <Link
                  href="/portal/register"
                  className="inline-flex h-12 items-center bg-[#2357ff] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#4773ff]"
                >
                  {zh ? '免费开始' : 'Start free'}
                </Link>
                <Link
                  href="/#boundary"
                  className="inline-flex h-12 items-center border border-white/25 px-6 text-sm font-bold text-white transition hover:border-white hover:bg-white/5"
                >
                  {zh ? '了解工作方式' : 'See how it works'}
                </Link>
              </div>
            </div>

            <div className="public-home-enter public-home-enter-delay-3 border-l border-white/15 pl-5 sm:pl-8 lg:pl-10">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                {zh ? '一次运行的边界' : 'One execution path'}
              </p>
              <ol className="mt-5 space-y-0 sm:mt-7">
                {[
                  [zh ? '在 WordPress 发起' : 'Requested in WordPress', zh ? '站点上下文与用户意图' : 'Site context and user intent'],
                  [zh ? '在 Cloud 执行' : 'Executed in Cloud', zh ? '模型调用、用量与诊断' : 'Model calls, usage, and diagnostics'],
                  [zh ? '回到 WordPress 确认' : 'Reviewed in WordPress', zh ? '人工确认后再发布' : 'Human approval before publishing'],
                ].map(([title, detail], index) => (
                  <li key={title} className="relative border-t border-white/15 py-4 pl-11 sm:py-5 sm:pl-12">
                    <span className="absolute left-0 top-4 text-sm font-black text-[#9eb3ff] sm:top-5">
                      0{index + 1}
                    </span>
                    <p className="font-bold">{title}</p>
                    <p className="mt-1 text-sm text-slate-400">{detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="capabilities"
          className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#0d1625]"
        >
          <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
            <PublicStatusSummary />
            <div className="mt-7 grid border-l border-t border-slate-200 dark:border-white/10 lg:grid-cols-3">
              {trustFacts.map((item) => (
                <article
                  key={item.index}
                  className="grid gap-3 border-b border-r border-slate-200 px-5 py-5 dark:border-white/10"
                >
                  <span className="font-mono text-xs text-[#2357ff]">{item.index}</span>
                  <h2 className="text-lg font-black">{zh ? item.zhTitle : item.enTitle}</h2>
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {zh ? item.zh : item.en}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="boundary" className="bg-[#e9edff] dark:bg-[#101c32]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:px-8 lg:py-20 xl:grid-cols-[.72fr_1.28fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#2357ff]">
                {zh ? '清晰边界' : 'Clear boundary'}
              </p>
              <h2 className="mt-5 text-3xl font-black leading-tight tracking-[-0.035em] sm:text-4xl">
                {zh ? '一条运行链，各负其责。' : 'One runtime path. Clear ownership on both sides.'}
              </h2>
              <p className="mt-5 max-w-xl leading-7 text-slate-600 dark:text-slate-300">
                {zh
                  ? 'Cloud 只增强托管运行与诊断，不复制 WordPress 的配置、审批和发布控制。'
                  : 'Cloud enhances hosted execution and diagnostics without copying WordPress settings, approval, or publishing control.'}
              </p>
            </div>
            <div className="grid border-l border-t border-[#2357ff]/20 sm:grid-cols-2">
              <div className="border-b border-r border-[#2357ff]/20 p-6">
                <p className="border-b border-[#2357ff]/30 pb-4 text-sm font-black text-[#2357ff]">
                  CLOUD
                </p>
                <ul className="mt-2 divide-y divide-[#2357ff]/15 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  <li className="py-3">{zh ? '运行模型与提供方适配' : 'Runs models and provider adapters'}</li>
                  <li className="py-3">{zh ? '记录套餐、用量与运行证据' : 'Records plan, usage, and runtime evidence'}</li>
                  <li className="py-3">{zh ? '解释服务状态、影响与下一步' : 'Explains service status, impact, and next steps'}</li>
                </ul>
              </div>
              <div className="border-b border-r border-[#2357ff]/20 p-6">
                <p className="border-b border-slate-400/40 pb-4 text-sm font-black">
                  WORDPRESS
                </p>
                <ul className="mt-2 divide-y divide-slate-400/20 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  <li className="py-3">{zh ? '保存站点内容、配置与能力' : 'Owns site content, settings, and abilities'}</li>
                  <li className="py-3">{zh ? '决定编辑、人工确认与发布' : 'Controls editing, human approval, and publishing'}</li>
                  <li className="py-3">{zh ? '保留本地工作流与最终写入权' : 'Retains local workflows and final write authority'}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <PublicPricingSection />

        <section
          data-home-final-cta
          className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#0d1625]"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-16 lg:px-8 lg:py-20 xl:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#2357ff]">
                {zh ? '从一个站点开始' : 'Start with one site'}
              </p>
              <h2 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-[-0.035em] sm:text-4xl">
                {zh ? '免费接入托管运行，控制权仍留在 WordPress。' : 'Start free. Keep control in WordPress.'}
              </h2>
              <p className="mt-4 max-w-3xl leading-7 text-slate-600 [text-wrap:pretty] dark:text-slate-300">
                {zh
                  ? '支持 QQ 快捷登录和邮箱验证码；创建账号后，从 WordPress Addon 连接即可激活 Free 服务。'
                  : 'Registration supports QQ quick sign-in and email codes. Connect from the WordPress addon afterward to activate Free service.'}
              </p>
            </div>
            <div className="flex flex-col items-start gap-4 xl:items-end">
              <Link
                href="/portal/register"
                className="inline-flex h-12 min-w-40 items-center justify-center bg-[#2357ff] px-6 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#4773ff]"
              >
                {zh ? '免费开始' : 'Start free'}
              </Link>
              <Link
                href="/portal/login"
                className="text-sm font-bold text-slate-600 underline-offset-4 hover:text-[#2357ff] hover:underline dark:text-slate-300"
              >
                {zh ? '已有账号，登录服务中心' : 'Already have an account? Sign in'}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicSiteShell>
  );
}
