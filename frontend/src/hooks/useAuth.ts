import { useEffect, useState } from 'react';
import nhost from '@/lib/nhost';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const auth = await nhost.auth.isAuthenticatedAsync();
      setIsAuthenticated(auth);
      if (auth) {
        setUser(nhost.auth.getUser());
      }
    };

    checkAuth();
    
    const { unsubscribe } = nhost.auth.onAuthStateChanged((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_CHANGED') {
        setIsAuthenticated(true);
        setUser(session?.user || null);
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem('nhostCustomToken');
      }
    });

    return unsubscribe;
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
