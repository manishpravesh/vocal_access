'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import nhost from '@/lib/nhost';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      const isAuth = await nhost.auth.isAuthenticatedAsync();
      if (isAuth) {
        if (localStorage.getItem('currentOrgId')) {
          router.push('/workflows');
        } else {
          router.push('/select-org');
        }
      } else {
        router.push('/login');
      }
    };
    init();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse">Loading...</div>
    </div>
  );
}
