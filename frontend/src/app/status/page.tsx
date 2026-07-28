'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';
import { useLocale } from '@/contexts/LocaleContext';

type HealthState = 'checking' | 'healthy' | 'unavailable';

export default function StatusPage() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const [state, setState] = useState<HealthState>('checking');
  const [checkedAt, setCheckedAt] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  const checkHealth = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState('checking');
    setCheckedAt('');
    fetch('/api/health', {
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
    })
      .then(async (response) => {
        const payload = await response.json() as { status?: string; checked_at?: string };
        if (controller.signal.aborted) return;
        setState(response.ok && payload.status === 'healthy' ? 'healthy' : 'unavailable');
        setCheckedAt(String(payload.checked_at || ''));
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('unavailable');
      });
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    return checkHealth();
  }, [checkHealth]);

  const healthy = state === 'healthy';

  return (
    <PublicSiteShell>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-5 py-16 sm:py-24 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#2357ff]">
          {zh ? '服务状态' : 'Service status'}
        </p>
        <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
          {state === 'checking'
              ? (zh ? '正在检查官网与服务中心 API…' : 'Checking website and Portal API…')
            : healthy
              ? (zh ? '官网与服务中心 API 入口正常' : 'Website and Portal API entry are operational')
              : (zh ? '官网或服务中心 API 入口异常' : 'Website or Portal API entry is unavailable')}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">
          {zh
            ? '这里展示普通用户能够理解和验证的公开可用性。账号、站点和单次运行的详细诊断只在登录后的服务中心显示。'
            : 'This page shows public availability that users can understand and verify. Account, site, and individual-run diagnostics are available only after sign-in.'}
        </p>

        <div className={`mt-10 border-l-4 px-5 py-4 ${healthy ? 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/25 dark:text-emerald-100' : state === 'checking' ? 'border-slate-400 bg-white text-slate-700 dark:bg-white/5 dark:text-slate-200' : 'border-red-500 bg-red-50 text-red-950 dark:bg-red-950/25 dark:text-red-100'}`}>
          <p className="font-bold">
            {state === 'checking'
              ? (zh ? '正在获取最新检查结果' : 'Retrieving the latest check')
              : healthy
                ? (zh ? '当前影响：未发现公开入口故障' : 'Current impact: no public-entry outage detected')
                : (zh ? '当前影响：官网、登录或页面请求可能失败' : 'Current impact: website, sign-in, or page requests may fail')}
          </p>
          <p className="mt-2 text-sm leading-6 opacity-80">
            {state === 'unavailable'
              ? (zh ? '请稍后重试；如果问题持续，记录发生时间和页面地址，恢复登录后通过工单提交。' : 'Try again shortly. If it continues, note the time and page URL, then submit a ticket after sign-in is restored.')
              : (zh ? '此结果只代表公开入口；您自己的站点运行、额度和提供方状态需要登录后查看。' : 'This result covers only the public entry. Sign in to review your site runtime, allowance, and provider status.')}
          </p>
        </div>

        <div className="mt-12 border-t border-slate-300 dark:border-white/15">
          <div className="grid items-center gap-4 border-b border-slate-300 py-7 dark:border-white/15 sm:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-lg font-bold">{zh ? '官网与服务中心 API 入口' : 'Website and Portal API entry'}</h2>
              <p className="mt-1 text-sm text-slate-500">{zh ? '前端页面与 Cloud API 存活性' : 'Frontend delivery and Cloud API liveness'}</p>
            </div>
            <span className={`inline-flex w-fit items-center gap-2 text-sm font-bold ${healthy ? 'text-emerald-700 dark:text-emerald-400' : state === 'checking' ? 'text-slate-500' : 'text-red-700 dark:text-red-400'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${healthy ? 'bg-emerald-500' : state === 'checking' ? 'bg-slate-400' : 'bg-red-500'}`} />
              {state === 'checking' ? (zh ? '检查中' : 'Checking') : healthy ? (zh ? '正常' : 'Operational') : (zh ? '异常' : 'Unavailable')}
            </span>
          </div>
          <div className="grid items-center gap-4 border-b border-slate-300 py-7 dark:border-white/15 sm:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-lg font-bold">{zh ? '站点运行与提供方状态' : 'Site runtime and provider status'}</h2>
              <p className="mt-1 text-sm text-slate-500">{zh ? '按账号授权展示，避免公开内部运行信息' : 'Shown per authorized account to protect internal runtime information'}</p>
            </div>
            <Link href="/portal" className="text-sm font-bold text-[#2357ff] hover:underline">{zh ? '登录后查看 →' : 'Sign in to view →'}</Link>
          </div>
          <div className="grid items-center gap-4 border-b border-slate-300 py-7 dark:border-white/15 sm:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-lg font-bold">{zh ? '套餐、用量与支付记录' : 'Plans, usage, and payment records'}</h2>
              <p className="mt-1 text-sm text-slate-500">{zh ? '按账号授权展示当前套餐与订单证据' : 'Current package and order evidence shown to the authorized account'}</p>
            </div>
            <Link href="/portal/billing" className="text-sm font-bold text-[#2357ff] hover:underline">{zh ? '登录后查看 →' : 'Sign in to view →'}</Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          {checkedAt ? (
            <p>
              {zh ? '最近检查：' : 'Last checked: '}
              {new Date(checkedAt).toLocaleString(zh ? 'zh-CN' : 'en-US')}
            </p>
          ) : null}
          <button type="button" className="font-bold text-[#2357ff] hover:underline disabled:cursor-wait disabled:opacity-60" disabled={state === 'checking'} onClick={() => checkHealth()}>
            {zh ? '重新检查' : 'Check again'}
          </button>
        </div>
      </main>
    </PublicSiteShell>
  );
}
