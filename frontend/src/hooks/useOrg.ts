import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useOrg() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // In our custom flow, the org ID is in the custom JWT.
    // For simplicity, we also store it in localStorage when selected.
    const storedOrgId = localStorage.getItem('currentOrgId');
    if (storedOrgId) {
      setOrgId(storedOrgId);
    }
  }, []);

  const selectOrg = (id: string, token: string) => {
    localStorage.setItem('currentOrgId', id);
    localStorage.setItem('nhostCustomToken', token);
    setOrgId(id);
    // Reload window to re-init Apollo with new token
    window.location.href = '/workflows';
  };

  return { orgId, selectOrg };
}

export function useRequireOrg() {
  const { orgId, selectOrg } = useOrg();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('currentOrgId');
      if (!stored) {
        router.push('/select-org');
      }
    }
  }, [router]);

  return { orgId, selectOrg };
}
