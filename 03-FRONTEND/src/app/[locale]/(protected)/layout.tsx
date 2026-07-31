import type { ReactNode } from 'react';
import { RequireAuth } from '../../../components/guards/require-auth';

/**
 * Protected route group layout. Wraps children in the UX-only RequireAuth guard.
 * SECURITY: backend enforces authorization; this guard is UX only (see guard file).
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-screen">{children}</div>
    </RequireAuth>
  );
}