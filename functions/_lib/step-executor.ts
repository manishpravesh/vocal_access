import { adminClient } from './hasura-admin';
import { callLLM } from './llm-client';

export async function executeSteps(
  workflowRunId: string,
  steps: any[],
  startFromOrder: number,
  prevOutput: any = {},
  orgId: string
): Promise<{ status: 'completed' | 'paused' | 'failed'; error?: string }> {

  let currentOutput = prevOutput;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.step_order < startFromOrder) continue;

    const stepRunId = await upsertStepRun(workflowRunId, step.id, step.step_order, 'running', currentOutput);

    try {
      let result: any = {};
      let skipToStepOrder: number | null = null;

      switch (step.step_type) {
        case 'llm_call':
          const prompt = replacePlaceholders(step.config.prompt_template, currentOutput);
          const llmResponse = await callLLM(prompt);
          result = { output: llmResponse };
          break;

        case 'http_request':
          const method = step.config.method || 'GET';
          const url = replacePlaceholders(step.config.url, currentOutput);
          const response = await fetch(url, {
            method,
            headers: step.config.headers || {},
            body: method !== 'GET' && step.config.body ? JSON.stringify(step.config.body) : undefined,
          });
          const data = await response.json().catch(() => ({}));
          result = { status: response.status, data };
          break;

        case 'db_write':
          const insertData = {
            org_id: orgId,
            workflow_run_id: workflowRunId,
            step_run_id: stepRunId,
            data: currentOutput,
          };
          const MUTATION = `
            mutation InsertResult($data: jsonb!, $org_id: uuid!, $workflow_run_id: uuid!, $step_run_id: uuid!) {
              insert_workflow_results_one(object: {data: $data, org_id: $org_id, workflow_run_id: $workflow_run_id, step_run_id: $step_run_id}) { id }
            }
          `;
          await adminClient.request(MUTATION, insertData);
          result = { success: true };
          break;

        case 'conditional_branch':
          // EXTREMELY basic JS evaluation for demo purposes. In production, use a safe evaluator.
          const conditionString = step.config.condition.replace(/output/g, 'currentOutput');
          let conditionResult = false;
          try {
            conditionResult = new Function('currentOutput', `return ${conditionString}`)(currentOutput);
          } catch (e) {
            console.error("Eval error", e);
          }
          
          skipToStepOrder = conditionResult ? step.config.true_next : step.config.false_next;
          result = { branch_taken: conditionResult };
          break;

        case 'approval_gate':
          await updateStepRun(stepRunId, 'waiting_approval', currentOutput);
          await updateWorkflowRun(workflowRunId, 'paused');
          return { status: 'paused' };

        case 'notify':
          // Notification will be handled by Event Trigger on step_run completion
          result = { notified: true };
          break;
          
        default:
          throw new Error(`Unknown step type: ${step.step_type}`);
      }

      await updateStepRun(stepRunId, 'completed', currentOutput, result);
      currentOutput = result;

      if (skipToStepOrder) {
        // Fast-forward loop to the required step_order
        // Find the index of the step with that order
        const targetIndex = steps.findIndex(s => s.step_order === skipToStepOrder);
        if (targetIndex !== -1) {
          // Mark in-between steps as skipped
          for (let j = i + 1; j < targetIndex; j++) {
            await upsertStepRun(workflowRunId, steps[j].id, steps[j].step_order, 'skipped', currentOutput);
          }
          i = targetIndex - 1; // loop will increment to targetIndex
        }
      }

    } catch (error: any) {
      await updateStepRun(stepRunId, 'failed', currentOutput, null, error.message);
      await updateWorkflowRun(workflowRunId, 'failed', error.message);
      return { status: 'failed', error: error.message };
    }
  }

  await updateWorkflowRun(workflowRunId, 'completed');
  return { status: 'completed' };
}

function replacePlaceholders(template: string, data: any): string {
  if (!template) return '';
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    // simplified lookup
    return data && data[path] ? String(data[path]) : 
           (path.startsWith('prev_output') && data.output ? String(data.output) : 
           (path === 'output' && data.output ? String(data.output) : ''));
  });
}

async function upsertStepRun(runId: string, stepId: string, order: number, status: string, input: any) {
  const UPSERT = `
    mutation UpsertStepRun($runId: uuid!, $stepId: uuid!, $order: Int!, $status: step_run_status!, $input: jsonb!) {
      insert_step_runs_one(
        object: {
          workflow_run_id: $runId, 
          workflow_step_id: $stepId, 
          step_order: $order, 
          status: $status, 
          input: $input,
          started_at: "now()"
        },
        on_conflict: {
          constraint: step_runs_workflow_run_id_workflow_step_id_key,
          update_columns: [status, input]
        }
      ) { id }
    }
  `;
  const res: any = await adminClient.request(UPSERT, { runId, stepId, order, status, input });
  return res.insert_step_runs_one.id;
}

async function updateStepRun(id: string, status: string, input: any = null, output: any = null, error: string | null = null) {
  const UPDATE = `
    mutation UpdateStepRun($id: uuid!, $status: step_run_status!, $input: jsonb, $output: jsonb, $error: String) {
      update_step_runs_by_pk(
        pk_columns: {id: $id}, 
        _set: {
          status: $status, 
          input: $input, 
          output: $output, 
          error: $error,
          completed_at: "now()"
        }
      ) { id }
    }
  `;
  await adminClient.request(UPDATE, { id, status, input, output, error });
}

export async function updateWorkflowRun(id: string, status: string, error: string | null = null) {
  const setObj: any = { status, error };
  if (status === 'completed' || status === 'failed') {
    setObj.completed_at = 'now()';
  } else if (status === 'running') {
    setObj.started_at = 'now()';
  }
  
  const UPDATE = `
    mutation UpdateWorkflowRun($id: uuid!, $set: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: $set) { id }
    }
  `;
  await adminClient.request(UPDATE, { id, set: setObj });
}
