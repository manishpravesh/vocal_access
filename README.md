# AI Agent Workflow Builder

A multi-tenant workflow engine for chaining AI agent steps, built on Vercel (Next.js) + Nhost (Postgres, Hasura, Functions).

## Setup & Local Development

This project uses the Nhost CLI for backend and standard npm for the Next.js frontend.

### 1. Backend (Nhost)
To run the local Nhost stack (Hasura, Postgres, Auth, Functions):
```bash
# Ensure you have Docker installed and running
npm i -g @nhost/cli

# Start the local environment
nhost up
```
This will apply the migrations and metadata from the `nhost/` directory automatically.

### 2. Frontend (Next.js)
```bash
cd frontend
npm install

# Copy env file
cp .env.example .env.local

# Run the dev server
npm run dev
```

### 3. Environment Variables
Add your Groq API key to the Nhost backend `.secrets` file:
```
GROQ_API_KEY=gsk_your_key_here
```

---

## Architecture & Implementation Write-up

### 1. Schema Reasoning
The schema is built hierarchically: `organizations -> workflows -> workflow_steps`. 
- **Flexibility**: We use JSONB `config` for steps and triggers instead of creating a massive table with 50 columns or separate tables for each step type.
- **Quota Tracking**: The quota is embedded directly on the `organizations` table (`quota_used`, `quota_limit`) allowing simple transactions when running workflows, avoiding complex joins. 
- **Aggregation**: A Postgres VIEW (`org_usage_stats`) calculates the monthly aggregates (total runs, average duration), fulfilling the Hasura aggregation requirement efficiently.

### 2. Two Permission Layers (And why they differ)
**Layer 1 (Hasura Row-Level Security)**
Hasura permissions protect *data access*. Every table permission utilizes an `_exists` check against the `org_members` table. For example, to read a workflow, Hasura validates: does the caller's `x-hasura-org-id` match the workflow's `org_id`, AND is the caller in the `org_members` table for that org? 
*Why here?* This prevents ID guessing attacks completely. An attacker cannot query another org's data because the database itself filters out the rows.

**Layer 2 (Step-Level Gating in Action Handlers)**
Certain business rules cannot be enforced by simple database read/write rules. For example, "only an owner can add a db_write step". 
This is enforced in the Action handler code (`trigger-workflow-run.ts`). When the user clicks "Run", the function queries their exact role in the organization. If they are an `editor` but the workflow contains a `db_write` step, the function explicitly rejects the execution. 
*Why here?* Hasura permissions can prevent an editor from inserting a `db_write` step into the database, but we also want to prevent them from executing a workflow that contains one. Furthermore, the `approveStep` logic (requiring an owner/editor to un-pause a run) requires a mid-execution state change that Hasura RLS cannot model effectively.

### 3. Approval Gate Pause/Resume
We implement a two-phase execution model for approval gates:
1. **Pause**: When the `step-executor.ts` engine encounters an `approval_gate` step, it sets the `step_run` status to `waiting_approval`, updates the overall `workflow_run` status to `paused`, and immediately returns (halts execution).
2. **Subscriptions**: The frontend Next.js app is subscribed to `step_runs`. It instantly sees the `waiting_approval` status and renders an "Approve" button.
3. **Resume**: An authorized user clicks Approve, calling the `approveStep` Hasura Action. The handler validates their role, marks the step as completed, and calls the engine again, passing the next step's order and the previous output to resume the sequential execution exactly where it left off.
