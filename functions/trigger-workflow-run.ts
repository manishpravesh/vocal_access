import { Request, Response } from 'express';
import { adminClient } from './_lib/hasura-admin';
import { executeSteps, updateWorkflowRun } from './_lib/step-executor';

export default async (req: Request, res: Response) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { input: { workflow_id } = {} as any, session_variables } = req.body;
    if (!workflow_id) return res.status(400).json({ error: 'workflow_id is required' });

    const userId = session_variables?.['x-hasura-user-id'];
    const orgId = session_variables?.['x-hasura-org-id'];
    const orgRole = session_variables?.['x-hasura-org-role'];

    if (!userId || !orgId) return res.status(401).json({ error: 'Unauthorized' });
    if (orgRole === 'viewer') return res.status(403).json({ error: 'Viewers cannot trigger workflows' });

    // Verify quota
    const ORG_QUERY = `
      query GetOrg($org_id: uuid!) {
        organizations_by_pk(id: $org_id) { quota_limit, quota_used }
      }
    `;
    const orgData: any = await adminClient.request(ORG_QUERY, { org_id: orgId });
    if (!orgData.organizations_by_pk) return res.status(404).json({ error: 'Organization not found' });
    
    if (orgData.organizations_by_pk.quota_used >= orgData.organizations_by_pk.quota_limit) {
      return res.status(429).json({ error: 'Organization quota exhausted' });
    }

    // Get Workflow & Steps
    const WF_QUERY = `
      query GetWorkflow($id: uuid!) {
        workflows_by_pk(id: $id) {
          org_id
          steps(order_by: {step_order: asc}) { id step_order step_type config }
        }
      }
    `;
    const wfData: any = await adminClient.request(WF_QUERY, { id: workflow_id });
    if (!wfData.workflows_by_pk) return res.status(404).json({ error: 'Workflow not found' });
    if (wfData.workflows_by_pk.org_id !== orgId) return res.status(403).json({ error: 'Organization mismatch' });

    const steps = wfData.workflows_by_pk.steps;

    // LAYER 2 CHECK: Verify step permissions
    if (orgRole !== 'owner') {
      const restrictedSteps = steps.filter((s: any) => s.step_type === 'db_write' || s.step_type === 'notify');
      if (restrictedSteps.length > 0) {
        return res.status(403).json({ error: 'Only owners can execute workflows with db_write or notify steps' });
      }
    }

    // Create workflow_run
    const CREATE_RUN = `
      mutation CreateRun($workflow_id: uuid!, $user_id: uuid!) {
        insert_workflow_runs_one(object: {workflow_id: $workflow_id, status: running, triggered_by: manual, triggered_by_user: $user_id, started_at: "now()"}) { id }
      }
    `;
    const runData: any = await adminClient.request(CREATE_RUN, { workflow_id, user_id: userId });
    const runId = runData.insert_workflow_runs_one.id;

    // Start execution in background (we don't await the whole thing here if it's slow, but for simplicity we will await)
    // In a real system, you'd enqueue a job. Since it's serverless and Nhost functions can run for some time, we execute it.
    
    executeSteps(runId, steps, 1, {}, orgId).then(async (result) => {
      // Increment quota if completed or paused (means it ran)
      const INCREMENT_QUOTA = `
        mutation IncrementQuota($org_id: uuid!) {
          update_organizations_by_pk(pk_columns: {id: $org_id}, _inc: {quota_used: 1}) { id }
        }
      `;
      await adminClient.request(INCREMENT_QUOTA, { org_id: orgId });
    }).catch(console.error);

    return res.status(200).json({ workflow_run_id: runId, status: 'running', message: 'Workflow started' });

  } catch (error: any) {
    console.error('Trigger error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
