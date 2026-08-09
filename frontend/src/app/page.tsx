'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import nhost from '@/lib/nhost';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const session = nhost.getUserSession();
    if (session) {
      if (localStorage.getItem('currentOrgId')) {
        router.push('/workflows');
      } else {
        router.push('/select-org');
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse">Loading...</div>
    </div>
  );
}
