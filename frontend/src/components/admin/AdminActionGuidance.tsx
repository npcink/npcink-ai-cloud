import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AdminActionGuidanceProps = {
  title: string;
  headingLevel?: 2 | 3;
  explanation?: ReactNode;
  evidence?: ReactNode;
  limitation?: ReactNode;
  nextStep: ReactNode;
  verification?: ReactNode;
  actions?: ReactNode;
  dataUi?: string;
  className?: string;
};

/** Presentation only: callers own scope, evidence, recovery and available actions. */
export function AdminActionGuidance({ title, headingLevel = 3, explanation, evidence, limitation, nextStep, verification, actions, dataUi, className }: AdminActionGuidanceProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <section data-ui={dataUi} className={cn('min-w-0 space-y-2 text-sm', className)}>
    <Heading className="font-semibold text-slate-950 dark:text-white">{title}</Heading>
    {explanation ? <div className="max-w-[80ch] leading-6 text-slate-600 dark:text-slate-300">{explanation}</div> : null}
    {evidence ? <div className="text-xs text-amber-700 dark:text-amber-300">{evidence}</div> : null}
    {limitation ? <div className="max-w-[100ch] text-xs leading-5 text-slate-500 dark:text-slate-400">{limitation}</div> : null}
    <div className="max-w-[80ch] leading-6">{nextStep}</div>
    {actions ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{actions}</div> : null}
    {verification ? <div className="max-w-[100ch] text-xs leading-5 text-slate-600 dark:text-slate-300">{verification}</div> : null}
  </section>;
}
