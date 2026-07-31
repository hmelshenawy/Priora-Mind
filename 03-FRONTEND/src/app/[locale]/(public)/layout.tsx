import type { ReactNode } from 'react';

/**
 * Public route group layout (research D4 / Frontend_Architecture.md).
 * Pre-auth surfaces: landing, register, verify-email. No auth guard here.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}