import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '注册服务中心',
  description: '创建 Npcink AI Cloud Free 账号，并保留所选套餐意图。',
};

export default function PortalRegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
