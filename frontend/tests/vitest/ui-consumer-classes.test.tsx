import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackofficePageStack, BackofficeSectionPanel } from '@/components/backoffice/BackofficeScaffold';
import { BackofficeFilterPill } from '@/components/backoffice/BackofficeFilterPill';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { PortalCard } from '@/components/portal/PortalScaffold';

// Exercise production components and their public props. Do not mock cn/twMerge,
// copy their rules, or assert the ordering of the entire class attribute.
function rendered(element: ReactElement) {
  const html = renderToStaticMarkup(element);
  const classAttribute = html.match(/\bclass="([^"]*)"/);
  if (!classAttribute) throw new Error('Expected a styled root element');
  return { html, classes: new Set(classAttribute[1].split(/\s+/)) };
}

describe('real UI consumers retain density and state classes', () => {
  it('uses the customer directory spacing override on the page stack', () => {
    // app/admin/accounts/page.tsx uses this exact public override.
    const { classes, html } = rendered(<BackofficePageStack className="space-y-5">Customer rows</BackofficePageStack>);
    expect(classes.has('space-y-5')).toBe(true);
    expect(classes.has('space-y-6')).toBe(false);
    expect(html).toContain('Customer rows');
  });

  it('retains the compact scope and the account detail important spacing override', () => {
    const compact = rendered(<BackofficePageStack spacing="compact">Diagnostics</BackofficePageStack>);
    expect(compact.classes.has('admin-tier-compact')).toBe(true);
    expect(compact.classes.has('space-y-3')).toBe(true);
    const account = rendered(<BackofficePageStack className="!space-y-4">Account</BackofficePageStack>);
    expect(account.classes.has('!space-y-4')).toBe(true);
  });

  it('does not let a base padding override erase the desktop panel modifier', () => {
    // The customer directory panel passes overflow-hidden p-0.
    const { classes } = rendered(<BackofficeSectionPanel className="overflow-hidden p-0">Directory</BackofficeSectionPanel>);
    expect(classes.has('surface-panel')).toBe(true);
    expect(classes.has('overflow-hidden')).toBe(true);
    expect(classes.has('p-0')).toBe(true);
    expect(classes.has('p-5')).toBe(false);
    expect(classes.has('md:p-6')).toBe(true);
    // Computed padding still needs the browser: globals.css adds scoped rules.
  });

  it('keeps the Portal empty-state vertical override and card horizontal padding', () => {
    // PortalScaffoldEmptyState renders PortalCard with py-8 text-center.
    const { classes } = rendered(<PortalCard className="py-8 text-center">No records</PortalCard>);
    expect(classes.has('py-8')).toBe(true);
    expect(classes.has('py-3.5')).toBe(false);
    expect(classes.has('px-4')).toBe(true);
    expect(classes.has('dark:bg-slate-950')).toBe(true);
    expect(classes.has('text-center')).toBe(true);
  });

  it('switches a directory filter from hover affordance to selected state', () => {
    const inactive = rendered(<BackofficeFilterPill active={false} aria-pressed={false} disabled>Inactive</BackofficeFilterPill>);
    expect(inactive.classes.has('hover:text-slate-950')).toBe(true);
    expect(inactive.classes.has('dark:hover:text-white')).toBe(true);
    expect(inactive.classes.has('px-3')).toBe(true);
    expect(inactive.html).toContain('aria-pressed="false"');
    expect(inactive.html).toContain('disabled=""');
    const active = rendered(<BackofficeFilterPill active aria-pressed>Active</BackofficeFilterPill>);
    expect(active.classes.has('bg-slate-900')).toBe(true);
    expect(active.classes.has('dark:bg-white')).toBe(true);
    expect(active.classes.has('hover:text-slate-950')).toBe(false);
    expect(active.html).toContain('aria-pressed="true"');
  });

  it.each([
    ['active', 'bg-emerald-100', 'dark:bg-emerald-950/30'],
    ['pending', 'bg-amber-100', 'dark:bg-amber-950/30'],
    ['failed', 'bg-rose-100', 'dark:bg-rose-950/30'],
  ])('retains the %s status capsule with a dark tone', (status, light, dark) => {
    const { classes, html } = rendered(<BackofficeStatusBadge status={status} label={status} />);
    expect(classes.has(light)).toBe(true);
    expect(classes.has(dark)).toBe(true);
    expect(classes.has('rounded-full')).toBe(true);
    expect(classes.has('px-2.5')).toBe(true);
    expect(classes.has('text-xs')).toBe(true);
    expect(html).toContain(`>${status}</span>`);
  });
});
