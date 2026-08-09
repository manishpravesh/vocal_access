'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import nhost from '@/lib/nhost';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';

export default function SelectOrg() {
  const { isAuthenticated, user } = useAuth();
  const { selectOrg } = useOrg();
  const router = useRouter();
  
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated === false) {
      router.push('/login');
    } else if (isAuthenticated === true && user) {
      fetchOrgs();
    }
  }, [isAuthenticated, user]);

  const fetchOrgs = async () => {
    try {
      const token = nhost.auth.getAccessToken();
      // Use GraphQL directly to fetch orgs user belongs to
      const query = `
        query {
          org_members {
            role
            organization {
              id
              name
              slug
            }
          }
        }
      `;
      const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
      const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'local';
      const res = await fetch(`https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (data.errors) throw new Error(data.errors[0].message);
      
      setOrgs(data.data.org_members || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrg = async (orgId: string) => {
    setLoading(true);
    try {
      const token = nhost.auth.getAccessToken();
      const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
      const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'local';
      
      const res = await fetch(`https://${subdomain}.functions.${region}.nhost.run/v1/select-org`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ org_id: orgId })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      selectOrg(orgId, data.token);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;

  return (
    <div className="container mt-20">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-center mb-8">Select Organization</h1>
        
        {error && <div className="badge badge-danger mb-4">{error}</div>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {orgs.map((member) => (
            <div 
              key={member.organization.id} 
              className="glass-card cursor-pointer"
              onClick={() => handleSelectOrg(member.organization.id)}
            >
              <div className="flex justify-between items-center mb-4">
                <h3>{member.organization.name}</h3>
                <span className={`badge ${member.role === 'owner' ? 'badge-danger' : member.role === 'editor' ? 'badge-warning' : 'badge-info'}`}>
                  {member.role}
                </span>
              </div>
              <p className="text-sm">Slug: {member.organization.slug}</p>
            </div>
          ))}
          
          {orgs.length === 0 && (
            <div className="col-span-full glass-card text-center py-10">
              <p>You don't belong to any organizations yet.</p>
              {/* Note: Organization creation logic goes here */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
