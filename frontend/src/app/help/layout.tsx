import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '帮助中心',
  description: 'Npcink AI Cloud 登录、WordPress 连接、状态检查与问题反馈指南。',
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
