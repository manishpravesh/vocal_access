'use client';

import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import Link from 'next/link';
import { useOrg } from '@/hooks/useOrg';
import { Play, Plus, Activity, AlertCircle, Clock } from 'lucide-react';

const GET_WORKFLOWS = gql`
  query GetOrgWorkflows($org_id: uuid!) {
    workflows(where: { org_id: { _eq: $org_id } }, order_by: { updated_at: desc }) {
      id
      name
      description
      is_active
      steps_aggregate { aggregate { count } }
      runs(order_by: { created_at: desc }, limit: 1) {
        id
        status
        created_at
      }
    }
    org_usage_stats(where: { org_id: { _eq: $org_id } }) {
      quota_limit
      quota_used
      total_runs_this_month
    }
  }
`;

type WorkflowQueryData = {
  workflows: Array<{
    id: string;
    name: string;
    description?: string | null;
    is_active: boolean;
    steps_aggregate: { aggregate: { count: number } };
    runs: Array<{
      id: string;
      status: string;
      created_at: string;
    }>;
  }>;
  org_usage_stats: Array<{
    quota_limit: number;
    quota_used: number;
    total_runs_this_month?: number | null;
  }>;
};

export default function Workflows() {
  const { orgId } = useOrg();
  
  const { data, loading, error } = useQuery<WorkflowQueryData, { org_id: string }>(GET_WORKFLOWS, {
    variables: { org_id: orgId ?? '' },
    skip: !orgId,
    pollInterval: 10000, // Poll every 10s for updates
  });

  if (loading) return <div className="p-10 text-center">Loading workflows...</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;

  const workflows = data?.workflows || [];
  const stats = data?.org_usage_stats?.[0] ?? { quota_limit: 100, quota_used: 0, total_runs_this_month: 0 };
  
  const quotaPercentage = (stats.quota_used / stats.quota_limit) * 100;

  return (
    <div className="p-10">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="mb-2">Workflows</h1>
          <p className="mb-0">Manage and monitor your AI agent workflows.</p>
        </div>
        
        <Link href="/workflows/new" className="btn btn-primary">
          <Plus size={18} /> New Workflow
        </Link>
      </div>

      <div className="glass-card mb-8">
        <div className="flex justify-between items-center mb-2">
          <h3>Quota Usage</h3>
          <span className="text-sm font-mono">{stats.quota_used} / {stats.quota_limit}</span>
        </div>
        <div className="w-full bg-black/30 rounded-full h-3">
          <div 
            className={`h-3 rounded-full ${quotaPercentage > 90 ? 'bg-red-500' : quotaPercentage > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(quotaPercentage, 100)}%` }}
          ></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {workflows.map((wf: any) => (
          <Link href={`/workflows/${wf.id}`} key={wf.id}>
            <div className="glass-card h-full flex flex-col hover:border-blue-500/50 cursor-pointer transition">
              <div className="flex justify-between items-start mb-4">
                <h3 className="mb-0 truncate pr-4" title={wf.name}>{wf.name}</h3>
                {!wf.is_active && <span className="badge badge-warning">Inactive</span>}
              </div>
              
              <p className="text-sm flex-grow">{wf.description || 'No description'}</p>
              
              <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center text-sm text-secondary">
                <div className="flex items-center gap-1">
                  <Activity size={14} /> {wf.steps_aggregate.aggregate.count} steps
                </div>
                
                {wf.runs.length > 0 ? (
                  <div className="flex items-center gap-2">
                    {wf.runs[0].status === 'completed' && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
                    {wf.runs[0].status === 'failed' && <div className="w-2 h-2 rounded-full bg-red-500"></div>}
                    {wf.runs[0].status === 'running' && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>}
                    {wf.runs[0].status === 'paused' && <div className="w-2 h-2 rounded-full bg-yellow-500"></div>}
                    <span className="capitalize">{wf.runs[0].status}</span>
                  </div>
                ) : (
                  <span className="text-gray-500">No runs yet</span>
                )}
              </div>
            </div>
          </Link>
        ))}
        
        {workflows.length === 0 && (
          <div className="col-span-full text-center py-20 glass-card">
            <Clock className="mx-auto mb-4 opacity-50" size={48} />
            <h3>No workflows found</h3>
            <p>Create your first workflow to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
