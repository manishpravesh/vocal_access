import { useEffect, useState } from 'react';
import nhost from '@/lib/nhost';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const session = nhost.getUserSession();
    setIsAuthenticated(Boolean(session));
    setUser(session?.user || null);
  }, []);

  return { isAuthenticated, user };
}

export function useRequireAuth() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated === false) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  return { isAuthenticated, user };
}
