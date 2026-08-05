import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '登录服务中心',
  description: '使用 QQ 或邮箱验证码登录 Npcink AI Cloud 服务中心。',
  other: {
    'npcink-portal-activation-contract': 'addon-verified-free-activation-v1',
  },
};

export default function PortalLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
