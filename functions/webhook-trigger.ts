import { Request, Response } from 'express';
import { adminClient } from './_lib/hasura-admin';
import { executeSteps } from './_lib/step-executor';

export default async (req: Request, res: Response) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { workflow_id } = req.body;
    const providedSecret = req.headers['x-webhook-secret'];

    if (!workflow_id) return res.status(400).json({ error: 'workflow_id is required' });
    if (!providedSecret) return res.status(401).json({ error: 'Webhook secret is missing' });

    const WF_QUERY = `
      query GetWorkflow($id: uuid!) {
        workflows_by_pk(id: $id) {
          org_id
          is_active
          triggers(where: {trigger_type: {_eq: webhook}, is_active: {_eq: true}}) { config }
          steps(order_by: {step_order: asc}) { id step_order step_type config }
          organization { quota_limit quota_used }
        }
      }
    `;
    const wfData: any = await adminClient.request(WF_QUERY, { id: workflow_id });
    const workflow = wfData.workflows_by_pk;

    if (!workflow || !workflow.is_active) return res.status(404).json({ error: 'Workflow not found or inactive' });
    if (workflow.organization.quota_used >= workflow.organization.quota_limit) {
      return res.status(429).json({ error: 'Organization quota exhausted' });
    }

    const webhookTrigger = workflow.triggers[0];
    if (!webhookTrigger) return res.status(404).json({ error: 'Webhook trigger not found or inactive' });
    if (webhookTrigger.config.secret !== providedSecret) return res.status(403).json({ error: 'Invalid secret' });

    // Create workflow_run
    const CREATE_RUN = `
      mutation CreateRun($workflow_id: uuid!) {
        insert_workflow_runs_one(object: {workflow_id: $workflow_id, status: running, triggered_by: webhook, started_at: "now()"}) { id }
      }
    `;
    const runData: any = await adminClient.request(CREATE_RUN, { workflow_id });
    const runId = runData.insert_workflow_runs_one.id;

    executeSteps(runId, workflow.steps, 1, req.body, workflow.org_id).then(async () => {
      const INCREMENT_QUOTA = `
        mutation IncrementQuota($org_id: uuid!) {
          update_organizations_by_pk(pk_columns: {id: $org_id}, _inc: {quota_used: 1}) { id }
        }
      `;
      await adminClient.request(INCREMENT_QUOTA, { org_id: workflow.org_id });
    }).catch(console.error);

    return res.status(200).json({ message: 'Webhook triggered successfully', workflow_run_id: runId });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
