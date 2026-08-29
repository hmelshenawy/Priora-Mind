import type { ReactNode } from 'react';
import { AppShell } from '../../../../features/home/app-shell';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
