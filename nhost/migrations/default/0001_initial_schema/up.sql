-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE org_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type AS ENUM (
  'llm_call',
  'http_request',
  'db_write',
  'notify',
  'conditional_branch',
  'approval_gate'
);
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE step_run_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
  'waiting_approval'
);

-- ============================================================
-- TABLES
-- ============================================================

-- 1. Organizations
CREATE TABLE public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,

  -- Usage quota tracking
  quota_limit       INT NOT NULL DEFAULT 100,    -- max calls per billing period
  quota_used        INT NOT NULL DEFAULT 0,      -- calls used this period
  quota_period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Organization Members (junction: users ↔ orgs)
CREATE TABLE public.org_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,  -- references auth.users(id) managed by nhost
  role        org_role NOT NULL DEFAULT 'viewer',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(org_id, user_id)
);

-- 3. Workflows
CREATE TABLE public.workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID NOT NULL,  -- user_id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Workflow Steps (ordered nodes in a workflow)
CREATE TABLE public.workflow_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order      INT NOT NULL,             -- execution order (1-based)
  name            TEXT NOT NULL,
  step_type       step_type NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(workflow_id, step_order)
);

-- 5. Workflow Triggers
CREATE TABLE public.workflow_triggers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_type    trigger_type NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(workflow_id, trigger_type)
);

-- 6. Workflow Runs
CREATE TABLE public.workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  status          run_status NOT NULL DEFAULT 'pending',
  triggered_by    trigger_type NOT NULL DEFAULT 'manual',
  triggered_by_user UUID,   -- null for automated triggers
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Step Runs (one per step per run)
CREATE TABLE public.step_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  step_order      INT NOT NULL,
  status          step_run_status NOT NULL DEFAULT 'pending',
  input           JSONB DEFAULT '{}',
  output          JSONB DEFAULT '{}',
  error           TEXT,
  attempt_count   INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 1,    -- at least 1 retry

  -- Approval gate fields
  approved_by     UUID,      -- user who approved
  approved_at     TIMESTAMPTZ,

  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(workflow_run_id, workflow_step_id)
);

-- 8. Watched Tables (for database_event trigger demo)
CREATE TABLE public.watched_tables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Results table (for db_write step demo)
CREATE TABLE public.workflow_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  step_run_id     UUID REFERENCES public.step_runs(id) ON DELETE SET NULL,
  data            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX idx_org_members_org_id ON public.org_members(org_id);
CREATE INDEX idx_workflows_org_id ON public.workflows(org_id);
CREATE INDEX idx_workflow_steps_workflow_id ON public.workflow_steps(workflow_id);
CREATE INDEX idx_workflow_triggers_workflow_id ON public.workflow_triggers(workflow_id);
CREATE INDEX idx_workflow_runs_workflow_id ON public.workflow_runs(workflow_id);
CREATE INDEX idx_step_runs_workflow_run_id ON public.step_runs(workflow_run_id);
CREATE INDEX idx_step_runs_status ON public.step_runs(status);
CREATE INDEX idx_watched_tables_org_id ON public.watched_tables(org_id);

-- ============================================================
-- COMPUTED FIELD: org-level usage this month (as a VIEW)
-- ============================================================
CREATE OR REPLACE VIEW public.org_usage_stats AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.quota_limit,
  o.quota_used,
  o.quota_period_start,
  COUNT(DISTINCT wr.id) AS total_runs_this_month,
  AVG(
    CASE
      WHEN wr.completed_at IS NOT NULL AND wr.started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at))
    END
  ) AS avg_run_duration_seconds,
  COUNT(DISTINCT wr.id) FILTER (WHERE wr.status = 'completed') AS completed_runs,
  COUNT(DISTINCT wr.id) FILTER (WHERE wr.status = 'failed') AS failed_runs
FROM public.organizations o
LEFT JOIN public.workflows w ON w.org_id = o.id
LEFT JOIN public.workflow_runs wr
  ON wr.workflow_id = w.id
  AND wr.created_at >= date_trunc('month', NOW())
GROUP BY o.id, o.name, o.quota_limit, o.quota_used, o.quota_period_start;

-- ============================================================
-- FUNCTION: Reset quota monthly (for scheduled trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_monthly_quotas()
RETURNS void AS $$
BEGIN
  UPDATE public.organizations
  SET quota_used = 0,
      quota_period_start = date_trunc('month', NOW()),
      updated_at = NOW()
  WHERE quota_period_start < date_trunc('month', NOW());
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_workflow_steps_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
