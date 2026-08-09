'use client';

import { gql } from '@apollo/client';
import { useSubscription, useMutation } from '@apollo/client/react';
import { usePathname } from 'next/navigation';
import { Play, Check, AlertTriangle, Clock, PauseCircle, Info } from 'lucide-react';
import Link from 'next/link';
import { useOrg } from '@/hooks/useOrg';

const WATCH_RUN = gql`
  subscription WatchRun($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      id
      status
      started_at
      completed_at
      error
      workflow {
        name
        org_id
      }
    }
  }
`;

const WATCH_STEPS = gql`
  subscription WatchSteps($run_id: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $run_id } }, order_by: { step_order: asc }) {
      id
      step_order
      status
      input
      output
      error
      approved_by
      approved_at
      workflow_step {
        name
        step_type
      }
    }
  }
`;

const APPROVE_STEP = gql`
  mutation ApproveStep($id: uuid!) {
    approveStep(step_run_id: $id) {
      success
      message
    }
  }
`;

type RunQueryData = {
  workflow_runs_by_pk: {
    id: string;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
    error?: string | null;
    workflow: {
      name: string;
      org_id: string;
    };
  } | null;
};

type StepsQueryData = {
  step_runs: Array<{
    id: string;
    step_order: number;
    status: string;
    input?: unknown;
    output?: Record<string, unknown> | null;
    error?: string | null;
    approved_by?: string | null;
    approved_at?: string | null;
    workflow_step: {
      name: string;
      step_type: string;
    };
  }>;
};

export default function RunView({ params }: { params: { id: string, runId: string } }) {
  const { orgId } = useOrg();
  
  const { data: runData, loading: runLoading } = useSubscription<RunQueryData, { id: string }>(WATCH_RUN, {
    variables: { id: params.runId }
  });
  
  const { data: stepsData, loading: stepsLoading } = useSubscription<StepsQueryData, { run_id: string }>(WATCH_STEPS, {
    variables: { run_id: params.runId }
  });

  const [approveStepMutation, { loading: approving }] = useMutation(APPROVE_STEP);

  if (runLoading || stepsLoading) return <div className="p-10">Loading run data...</div>;

  const run = runData?.workflow_runs_by_pk;
  const steps = stepsData?.step_runs || [];

  if (!run) return <div className="p-10 text-red-500">Run not found.</div>;

  const handleApprove = async (stepRunId: string) => {
    try {
      await approveStepMutation({ variables: { id: stepRunId } });
      alert("Step approved, workflow resuming...");
    } catch (e: any) {
      alert("Error approving step: " + e.message);
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'completed': return <Check className="text-green-500" size={24} />;
      case 'running': return <Play className="text-blue-500 animate-pulse" size={24} />;
      case 'failed': return <AlertTriangle className="text-red-500" size={24} />;
      case 'waiting_approval': return <PauseCircle className="text-yellow-500" size={24} />;
      case 'skipped': return <Info className="text-gray-400" size={24} />;
      default: return <Clock className="text-gray-500" size={24} />;
    }
  };

  return (
    <div className="p-10 max-w-4xl mx-auto">
      <Link href="/workflows" className="text-blue-400 hover:underline mb-6 inline-block">&larr; Back to Workflows</Link>
      
      <div className="glass-card mb-10 flex justify-between items-center">
        <div>
          <h1 className="mb-1">{run.workflow.name} - Run Execution</h1>
          <p className="mb-0 text-sm font-mono text-gray-400">{run.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">Status:</span>
          <div className="flex items-center gap-2 px-4 py-2 bg-black/20 rounded-full border border-white/10">
            {getStatusIcon(run.status)}
            <span className="capitalize font-semibold">{run.status}</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[35px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
        
        {steps.map((step: any, idx: number) => (
          <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
              {getStatusIcon(step.status)}
            </div>
            
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] glass-card p-4 rounded border border-white/10">
              <div className="flex justify-between items-start mb-2">
                <div className="font-bold">{step.workflow_step.name}</div>
                <div className="badge bg-black/30 border border-white/10">{step.workflow_step.step_type}</div>
              </div>
              
              <div className="text-xs text-gray-400 mb-3">Status: <span className="text-white capitalize">{step.status}</span></div>
              
              {step.error && (
                <div className="bg-red-500/20 border border-red-500/30 p-2 rounded text-sm text-red-200 mb-3">
                  {step.error}
                </div>
              )}

              {step.status === 'waiting_approval' && (
                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <h4 className="text-yellow-500 mb-2 flex items-center gap-2"><PauseCircle size={16}/> Action Required</h4>
                  <p className="text-sm mb-4">This step requires approval before the workflow can continue.</p>
                  <button 
                    onClick={() => handleApprove(step.id)} 
                    disabled={approving}
                    className="btn bg-yellow-500 hover:bg-yellow-600 text-black w-full"
                  >
                    {approving ? 'Approving...' : 'Approve & Continue'}
                  </button>
                </div>
              )}

              {step.output && Object.keys(step.output).length > 0 && (
                <details className="mt-3 cursor-pointer group/details">
                  <summary className="text-xs text-blue-400 hover:text-blue-300 select-none">View Output</summary>
                  <pre className="mt-2 text-[10px] bg-black/40 p-2 rounded overflow-x-auto text-gray-300 border border-white/5">
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
