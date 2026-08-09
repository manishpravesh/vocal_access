import { Request, Response } from 'express';
import { adminClient } from './_lib/hasura-admin';
import { executeSteps, updateWorkflowRun } from './_lib/step-executor';

export default async (req: Request, res: Response) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { input: { step_run_id } = {} as any, session_variables } = req.body;
    if (!step_run_id) return res.status(400).json({ error: 'step_run_id is required' });

    const userId = session_variables?.['x-hasura-user-id'];
    const orgId = session_variables?.['x-hasura-org-id'];
    const orgRole = session_variables?.['x-hasura-org-role'];

    if (!userId || !orgId) return res.status(401).json({ error: 'Unauthorized' });
    if (orgRole === 'viewer') return res.status(403).json({ error: 'Viewers cannot approve steps' });

    const GET_STEP_RUN = `
      query GetStepRun($id: uuid!) {
        step_runs_by_pk(id: $id) {
          status
          step_order
          output
          workflow_run_id
          workflow_run {
            status
            workflow {
              org_id
              steps(order_by: {step_order: asc}) { id step_order step_type config }
            }
          }
        }
      }
    `;
    const data: any = await adminClient.request(GET_STEP_RUN, { id: step_run_id });
    const stepRun = data.step_runs_by_pk;

    if (!stepRun) return res.status(404).json({ error: 'Step run not found' });
    if (stepRun.status !== 'waiting_approval') return res.status(400).json({ error: 'Step is not waiting for approval' });
    
    const workflow = stepRun.workflow_run.workflow;
    if (workflow.org_id !== orgId) return res.status(403).json({ error: 'Organization mismatch' });

    // Mark as approved
    const APPROVE = `
      mutation ApproveStep($id: uuid!, $user_id: uuid!) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {status: completed, approved_by: $user_id, approved_at: "now()"}) { id }
      }
    `;
    await adminClient.request(APPROVE, { id: step_run_id, user_id: userId });
    
    // Resume workflow run
    await updateWorkflowRun(stepRun.workflow_run_id, 'running');

    // Execute remaining steps
    const nextOrder = stepRun.step_order + 1;
    executeSteps(stepRun.workflow_run_id, workflow.steps, nextOrder, stepRun.output, orgId).catch(console.error);

    return res.status(200).json({ success: true, message: 'Step approved and workflow resumed', workflow_run_id: stepRun.workflow_run_id });

  } catch (error: any) {
    console.error('Approve error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
