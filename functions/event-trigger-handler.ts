import { Request, Response } from 'express';
import { adminClient } from './_lib/hasura-admin';
import { executeSteps } from './_lib/step-executor';

export default async (req: Request, res: Response) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const payload = req.body;
    const newRow = payload.event?.data?.new;
    if (!newRow) return res.status(400).json({ error: 'Invalid payload' });

    const orgId = newRow.org_id;

    // Find workflows in this org that have a database_event trigger
    const WF_QUERY = `
      query GetEventWorkflows($org_id: uuid!) {
        workflows(where: {org_id: {_eq: $org_id}, is_active: {_eq: true}, triggers: {trigger_type: {_eq: database_event}, is_active: {_eq: true}}}) {
          id
          org_id
          steps(order_by: {step_order: asc}) { id step_order step_type config }
          organization { quota_limit quota_used }
        }
      }
    `;
    const data: any = await adminClient.request(WF_QUERY, { org_id: orgId });
    const workflows = data.workflows;

    for (const workflow of workflows) {
      if (workflow.organization.quota_used >= workflow.organization.quota_limit) continue;

      const CREATE_RUN = `
        mutation CreateRun($workflow_id: uuid!) {
          insert_workflow_runs_one(object: {workflow_id: $workflow_id, status: running, triggered_by: database_event, started_at: "now()"}) { id }
        }
      `;
      const runData: any = await adminClient.request(CREATE_RUN, { workflow_id: workflow.id });
      const runId = runData.insert_workflow_runs_one.id;

      executeSteps(runId, workflow.steps, 1, newRow.data, workflow.org_id).then(async () => {
        const INCREMENT = `
          mutation IncrementQuota($org_id: uuid!) {
            update_organizations_by_pk(pk_columns: {id: $org_id}, _inc: {quota_used: 1}) { id }
          }
        `;
        await adminClient.request(INCREMENT, { org_id: workflow.org_id });
      }).catch(console.error);
    }

    return res.status(200).json({ message: 'Database event processed', workflows_triggered: workflows.length });
  } catch (error: any) {
    console.error('DB Event trigger error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
