import type { ReactNode } from 'react';
import { TopNav } from './home-top-nav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TopNav />
      {children}
    </>
  );
}
