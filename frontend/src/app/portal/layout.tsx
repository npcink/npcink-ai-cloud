import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PortalNavbar } from '@/components/portal/PortalNavbar';
import { PortalSessionBoundary } from '@/components/portal/PortalSessionBoundary';
import { PortalSessionProvider } from '@/hooks/useSession';

export const metadata: Metadata = {
  title: '服务中心',
  description: '查看已连接站点、套餐、用量和服务记录。',
  robots: {
    index: false,
    follow: false,
  },
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalSessionProvider>
      <PortalSessionBoundary>
        <div className="portal-shell flex min-h-[100dvh] flex-col">
          <a
            href="#main-content"
            className="sr-only fixed left-4 top-4 z-[60] bg-slate-950 px-4 py-3 text-sm font-bold text-white focus:not-sr-only"
          >
            跳到主要内容 / Skip to main content
          </a>
          <Suspense fallback={null}>
            <PortalNavbar />
          </Suspense>
          <main id="main-content" tabIndex={-1} className="flex-1 bg-[#f5f5f7] dark:bg-slate-950">
            <div className="container mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </PortalSessionBoundary>
    </PortalSessionProvider>
  );
}
