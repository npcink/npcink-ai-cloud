import type { Locale } from '@/lib/i18n';

export type PublicNavigationHref =
  | '/#capabilities'
  | '/#boundary'
  | '/#pricing'
  | '/help'
  | '/privacy'
  | '/status'
  | '/terms';

type PublicNavigationItem = Readonly<{
  id: string;
  href: PublicNavigationHref;
  labels: Readonly<Record<Locale, string>>;
}>;

// Public navigation remains code-owned and fixed. This is not a runtime menu
// registry or a general-purpose page-management surface.
export const PUBLIC_HEADER_NAV_ITEMS = [
  {
    id: 'capabilities',
    href: '/#capabilities',
    labels: { en: 'Capabilities', 'zh-CN': '能力' },
  },
  {
    id: 'boundary',
    href: '/#boundary',
    labels: { en: 'How it works', 'zh-CN': '工作方式' },
  },
  {
    id: 'pricing',
    href: '/#pricing',
    labels: { en: 'Plans', 'zh-CN': '套餐' },
  },
  {
    id: 'help',
    href: '/help',
    labels: { en: 'Help', 'zh-CN': '帮助' },
  },
] as const satisfies readonly PublicNavigationItem[];

export const PUBLIC_FOOTER_NAV_ITEMS = [
  {
    id: 'privacy',
    href: '/privacy',
    labels: { en: 'Privacy', 'zh-CN': '隐私政策' },
  },
  {
    id: 'terms',
    href: '/terms',
    labels: { en: 'Terms', 'zh-CN': '服务条款' },
  },
  {
    id: 'status',
    href: '/status',
    labels: { en: 'Status', 'zh-CN': '服务状态' },
  },
] as const satisfies readonly PublicNavigationItem[];

export function publicNavigationLabel(
  item: PublicNavigationItem,
  locale: Locale
): string {
  return item.labels[locale];
}
