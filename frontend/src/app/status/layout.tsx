import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服务状态',
  description: '查看 Npcink AI Cloud 公开入口的当前可用性、影响和下一步。',
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
