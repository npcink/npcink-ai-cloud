import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服务条款',
  description: '使用 Npcink AI Cloud 官网、服务中心与托管运行服务的基本规则。',
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
