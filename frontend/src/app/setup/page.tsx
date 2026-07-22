import type { Metadata } from 'next';
import { SetupWizard } from '@/components/setup/SetupWizard';

export const metadata: Metadata = {
  title: 'Setup · Npcink AI Cloud',
  description: 'Initialize this Npcink AI Cloud deployment.',
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return <SetupWizard />;
}
