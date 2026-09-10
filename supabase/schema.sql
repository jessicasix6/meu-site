-- TOP3 worker — esquema de controle das tarefas automatizadas.
-- Rodar isso uma vez no SQL Editor do Supabase (dashboard do projeto).

create extension if not exists pgcrypto;

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('experiment', 'implementation', 'review')),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'testing', 'review', 'done', 'failed')),
  title text not null,
  description text not null,
  risk text not null default 'medium' check (risk in ('low', 'medium', 'high')),
  agent text,
  branch text,
  pr_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  agent text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  summary text
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  merged boolean not null default false,
  merged_at timestamptz
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  reviewer text not null default 'claude-self-review',
  verdict text not null check (verdict in ('approved', 'changes_requested')),
  findings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists verifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  check_name text not null,
  status text not null check (status in ('pass', 'fail')),
  details text,
  created_at timestamptz not null default now()
);

create table if not exists deployments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  environment text not null default 'production',
  url text,
  status text not null check (status in ('success', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  kind text not null check (kind in ('commit', 'pr', 'screenshot', 'log', 'note')),
  ref text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_agent_runs_task on agent_runs(task_id);
create index if not exists idx_branches_task on branches(task_id);
create index if not exists idx_reviews_task on reviews(task_id);
create index if not exists idx_verifications_task on verifications(task_id);
create index if not exists idx_deployments_task on deployments(task_id);
create index if not exists idx_evidence_task on evidence(task_id);
