'use client';

import { useRequireAuth } from '@/hooks/useAuth';
import { useRequireOrg } from '@/hooks/useOrg';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import nhost from '@/lib/nhost';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useRequireAuth();
  const pathname = usePathname();

  // If in select-org, we don't require org yet
  if (pathname === '/select-org') {
    return <>{children}</>;
  }

  // Require org for all other dashboard routes
  useRequireOrg();

  if (isAuthenticated === false) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-primary">
      {/* Sidebar */}
      <aside className="w-64 glass-panel border-r-0 border-y-0 rounded-none rounded-r-lg flex flex-col z-10">
        <div className="p-6">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            AgentFlow
          </h2>
          <p className="text-xs text-secondary mt-1">Mini n8n for AI</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <Link href="/workflows" className={`flex items-center px-4 py-3 rounded-md transition ${pathname === '/workflows' ? 'bg-white/10 text-white' : 'text-secondary hover:bg-white/5 hover:text-white'}`}>
            Workflows
          </Link>
          <Link href="/org" className={`flex items-center px-4 py-3 rounded-md transition ${pathname === '/org' ? 'bg-white/10 text-white' : 'text-secondary hover:bg-white/5 hover:text-white'}`}>
            Organization
          </Link>
        </nav>

        <div className="p-4 border-t border-glass">
          <button 
            onClick={async () => {
              const session = nhost.getUserSession();
              await nhost.auth.signOut({ refreshToken: session?.refreshToken, all: true });
              window.location.href = '/login';
            }}
            className="w-full text-left px-4 py-2 text-sm text-secondary hover:text-white transition"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 pointer-events-none"></div>
        {children}
      </main>
    </div>
  );
}
