'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '../../i18n/navigation';
import { cn } from '../../lib/utils';

type NavTarget = 'home' | 'plan' | 'chat';

export function TopNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const [hash, setHash] = useState('');

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('popstate', syncHash);
    return () => {
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('popstate', syncHash);
    };
  }, []);

  const active: NavTarget = pathname.startsWith('/chat')
    ? 'chat'
    : pathname === '/dashboard' && hash === '#coaching-plan'
      ? 'plan'
      : 'home';

  const links: Array<{ target: NavTarget; href: '/dashboard' | '/dashboard#coaching-plan' | '/chat'; label: string }> = [
    { target: 'home', href: '/dashboard', label: t('home') },
    { target: 'plan', href: '/dashboard#coaching-plan', label: t('plan') },
    { target: 'chat', href: '/chat', label: t('chat') },
  ];

  return (
    <nav className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur" aria-label={t('primary')}>
      <div className="container mx-auto flex items-center gap-2 text-sm font-medium">
        {links.map((link) => {
          const isActive = active === link.target;
          return (
            <Link
              key={link.target}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-full px-4 py-2 text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950',
                isActive && 'bg-slate-950 text-white',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
