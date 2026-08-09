DROP TRIGGER IF EXISTS trg_workflow_steps_updated_at ON public.workflow_steps;
DROP TRIGGER IF EXISTS trg_workflows_updated_at ON public.workflows;
DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;

DROP FUNCTION IF EXISTS public.set_updated_at();
DROP FUNCTION IF EXISTS public.reset_monthly_quotas();
DROP VIEW IF EXISTS public.org_usage_stats;

DROP TABLE IF EXISTS public.workflow_results CASCADE;
DROP TABLE IF EXISTS public.watched_tables CASCADE;
DROP TABLE IF EXISTS public.step_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_triggers CASCADE;
DROP TABLE IF EXISTS public.workflow_steps CASCADE;
DROP TABLE IF EXISTS public.workflows CASCADE;
DROP TABLE IF EXISTS public.org_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

DROP TYPE IF EXISTS step_run_status;
DROP TYPE IF EXISTS run_status;
DROP TYPE IF EXISTS trigger_type;
DROP TYPE IF EXISTS step_type;
DROP TYPE IF EXISTS org_role;
