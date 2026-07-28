import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隐私政策',
  description: 'Npcink AI Cloud 官网、服务中心与 QQ 登录的信息处理说明。',
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
