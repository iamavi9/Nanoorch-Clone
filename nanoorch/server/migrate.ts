import { pool } from "./db";
import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const INCREMENTAL_MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "add_ollama_provider_enum",
    sql: `ALTER TYPE "provider" ADD VALUE IF NOT EXISTS 'ollama'`,
  },
  {
    name: "add_orchestrators_base_url",
    sql: `ALTER TABLE "orchestrators" ADD COLUMN IF NOT EXISTS "base_url" text`,
  },
  {
    name: "add_agents_sandbox_timeout_seconds",
    sql: `ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "sandbox_timeout_seconds" integer`,
  },
  {
    name: "add_integration_mode",
    sql: `ALTER TABLE "cloud_integrations" ADD COLUMN IF NOT EXISTS "integration_mode" text DEFAULT 'tool' NOT NULL`,
  },
  {
    name: "add_cloud_provider_jira",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'jira'`,
  },
  {
    name: "add_cloud_provider_github",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'github'`,
  },
  {
    name: "add_cloud_provider_gitlab",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'gitlab'`,
  },
  {
    name: "add_cloud_provider_teams",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'teams'`,
  },
  {
    name: "add_cloud_provider_slack",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'slack'`,
  },
  {
    name: "add_cloud_provider_google_chat",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'google_chat'`,
  },
  {
    name: "add_channel_type_slack",
    sql: `ALTER TYPE "channel_type" ADD VALUE IF NOT EXISTS 'slack'`,
  },
  {
    name: "add_channel_type_teams",
    sql: `ALTER TYPE "channel_type" ADD VALUE IF NOT EXISTS 'teams'`,
  },
  {
    name: "add_channel_type_google_chat",
    sql: `ALTER TYPE "channel_type" ADD VALUE IF NOT EXISTS 'google_chat'`,
  },
  {
    name: "add_channel_type_generic_webhook",
    sql: `ALTER TYPE "channel_type" ADD VALUE IF NOT EXISTS 'generic_webhook'`,
  },
  {
    name: "create_channel_deliveries",
    sql: `CREATE TABLE IF NOT EXISTS "channel_deliveries" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "channel_id" varchar NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      "event" text NOT NULL,
      "status_code" integer,
      "response_body" text,
      "error" text,
      "sent_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "add_tasks_parent_task_id",
    sql: `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "parent_task_id" varchar`,
  },
  {
    name: "create_scheduled_jobs",
    sql: `CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      "orchestrator_id" varchar NOT NULL REFERENCES orchestrators(id) ON DELETE CASCADE,
      "agent_id" varchar NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      "name" text NOT NULL,
      "prompt" text NOT NULL,
      "cron_expression" varchar NOT NULL,
      "timezone" varchar DEFAULT 'UTC',
      "is_active" boolean DEFAULT true,
      "last_run_at" timestamp,
      "next_run_at" timestamp,
      "last_task_id" varchar,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_approval_requests",
    sql: `CREATE TABLE IF NOT EXISTS "approval_requests" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      "task_id" varchar REFERENCES tasks(id) ON DELETE SET NULL,
      "agent_id" varchar REFERENCES agents(id) ON DELETE SET NULL,
      "agent_name" text,
      "message" text NOT NULL,
      "action" text NOT NULL,
      "impact" text,
      "status" text NOT NULL DEFAULT 'pending',
      "resolved_by" varchar,
      "resolution" text,
      "resolved_at" timestamp,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_pipelines",
    sql: `CREATE TABLE IF NOT EXISTS "pipelines" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      "orchestrator_id" varchar NOT NULL REFERENCES orchestrators(id) ON DELETE CASCADE,
      "name" text NOT NULL,
      "description" text,
      "is_active" boolean DEFAULT true,
      "cron_expression" varchar,
      "timezone" varchar DEFAULT 'UTC',
      "last_run_at" timestamp,
      "next_run_at" timestamp,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_pipeline_steps",
    sql: `CREATE TABLE IF NOT EXISTS "pipeline_steps" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "pipeline_id" varchar NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      "agent_id" varchar NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      "name" text NOT NULL,
      "prompt_template" text NOT NULL,
      "step_order" integer NOT NULL,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_pipeline_runs",
    sql: `CREATE TABLE IF NOT EXISTS "pipeline_runs" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "pipeline_id" varchar NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      "status" text NOT NULL DEFAULT 'pending',
      "triggered_by" text DEFAULT 'manual',
      "started_at" timestamp,
      "completed_at" timestamp,
      "error" text,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_pipeline_step_runs",
    sql: `CREATE TABLE IF NOT EXISTS "pipeline_step_runs" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" varchar NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
      "step_id" varchar NOT NULL REFERENCES pipeline_steps(id) ON DELETE CASCADE,
      "task_id" varchar REFERENCES tasks(id) ON DELETE SET NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "output" text,
      "started_at" timestamp,
      "completed_at" timestamp,
      "error" text
    )`,
  },
  {
    name: "create_token_usage",
    sql: `CREATE TABLE IF NOT EXISTS "token_usage" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      "task_id" varchar REFERENCES tasks(id) ON DELETE SET NULL,
      "agent_id" varchar REFERENCES agents(id) ON DELETE SET NULL,
      "agent_name" text,
      "provider" text NOT NULL,
      "model" text NOT NULL,
      "input_tokens" integer NOT NULL DEFAULT 0,
      "output_tokens" integer NOT NULL DEFAULT 0,
      "estimated_cost_usd" real DEFAULT 0,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_user_sessions",
    sql: `CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire")`,
  },
  {
    name: "add_tasks_comms_thread_id",
    sql: `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "comms_thread_id" varchar`,
  },
  {
    name: "add_workspaces_is_comms_workspace",
    sql: `ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "is_comms_workspace" boolean DEFAULT false`,
  },
  {
    name: "create_comms_threads",
    sql: `CREATE TABLE IF NOT EXISTS "comms_threads" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "channel_id" varchar NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      "external_thread_id" text NOT NULL,
      "external_channel_id" text,
      "external_user_id" text,
      "external_user_name" text,
      "agent_id" varchar REFERENCES agents(id) ON DELETE SET NULL,
      "platform" text NOT NULL,
      "conversation_ref" jsonb DEFAULT '{}',
      "created_at" timestamp DEFAULT now(),
      "last_activity_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "add_orchestrators_failover",
    sql: `ALTER TABLE "orchestrators" ADD COLUMN IF NOT EXISTS "failover_provider" text;
          ALTER TABLE "orchestrators" ADD COLUMN IF NOT EXISTS "failover_model" text`,
  },
  {
    name: "add_tasks_bypass_retry",
    sql: `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "bypass_approval" boolean DEFAULT false;
          ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 0`,
  },
  {
    name: "add_comms_threads_history",
    sql: `ALTER TABLE "comms_threads" ADD COLUMN IF NOT EXISTS "history" jsonb DEFAULT '[]'`,
  },
  {
    name: "create_sso_providers",
    sql: `CREATE TABLE IF NOT EXISTS "sso_providers" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" text NOT NULL,
      "type" text NOT NULL,
      "is_active" boolean DEFAULT true,
      "config" jsonb DEFAULT '{}',
      "default_role" text DEFAULT 'member',
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_event_triggers",
    sql: `CREATE TABLE IF NOT EXISTS "event_triggers" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      "orchestrator_id" varchar NOT NULL REFERENCES orchestrators(id) ON DELETE CASCADE,
      "agent_id" varchar NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      "name" text NOT NULL,
      "source" text NOT NULL,
      "event_types" text[] DEFAULT '{}',
      "prompt_template" text NOT NULL,
      "secret_token" text,
      "filter_config" jsonb DEFAULT '{}',
      "is_active" boolean DEFAULT true,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_trigger_events",
    sql: `CREATE TABLE IF NOT EXISTS "trigger_events" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "trigger_id" varchar NOT NULL REFERENCES event_triggers(id) ON DELETE CASCADE,
      "source" text NOT NULL,
      "event_type" text NOT NULL,
      "payload_preview" text,
      "matched" boolean DEFAULT false,
      "task_id" varchar,
      "error" text,
      "received_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "add_agents_heartbeat_fields",
    sql: `ALTER TABLE "agents"
      ADD COLUMN IF NOT EXISTS "heartbeat_enabled" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "heartbeat_interval_minutes" integer DEFAULT 30,
      ADD COLUMN IF NOT EXISTS "heartbeat_checklist" text,
      ADD COLUMN IF NOT EXISTS "heartbeat_target" text DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS "heartbeat_model" text,
      ADD COLUMN IF NOT EXISTS "heartbeat_silence_phrase" text DEFAULT 'HEARTBEAT_OK',
      ADD COLUMN IF NOT EXISTS "heartbeat_last_fired_at" timestamp`,
  },
  {
    name: "add_tasks_is_heartbeat",
    sql: `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_heartbeat" boolean DEFAULT false`,
  },
  {
    name: "add_notify_channel_delivery",
    sql: `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "notify_channel_id" varchar;
          ALTER TABLE "scheduled_jobs" ADD COLUMN IF NOT EXISTS "notify_channel_id" varchar;
          ALTER TABLE "pipelines" ADD COLUMN IF NOT EXISTS "notify_channel_id" varchar;
          ALTER TABLE "event_triggers" ADD COLUMN IF NOT EXISTS "notify_channel_id" varchar;
          ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "heartbeat_notify_channel_id" varchar`,
  },
  {
    name: "add_workspace_config_utilization_alert",
    sql: `ALTER TABLE "workspace_config" ADD COLUMN IF NOT EXISTS "utilization_alert_threshold_tokens" integer;
          ALTER TABLE "workspace_config" ADD COLUMN IF NOT EXISTS "utilization_alert_channel_id" varchar`,
  },
  {
    name: "add_cloud_provider_servicenow",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'servicenow'`,
  },
  {
    name: "create_mcp_api_keys",
    sql: `CREATE TABLE IF NOT EXISTS "mcp_api_keys" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "key_hash" text NOT NULL,
      "created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
      "last_used_at" timestamp,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "add_scheduled_jobs_intent_bypass",
    sql: `ALTER TABLE "scheduled_jobs" ADD COLUMN IF NOT EXISTS "intent" varchar;
          ALTER TABLE "scheduled_jobs" ADD COLUMN IF NOT EXISTS "bypass_approval" boolean DEFAULT false`,
  },
  {
    name: "add_event_triggers_bypass",
    sql: `ALTER TABLE "event_triggers" ADD COLUMN IF NOT EXISTS "bypass_approval" boolean DEFAULT false`,
  },
  {
    name: "enable_pgvector_extension",
    sql: `CREATE EXTENSION IF NOT EXISTS vector`,
  },
  {
    name: "create_agent_memory_vectors",
    sql: `CREATE TABLE IF NOT EXISTS "agent_memory_vectors" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "agent_id" varchar NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      "workspace_id" varchar NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      "task_id" varchar,
      "content" text NOT NULL,
      "embedding" vector(1536) NOT NULL,
      "source" text NOT NULL DEFAULT 'task_output',
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_agent_memory_vectors_hnsw_index",
    sql: `CREATE INDEX IF NOT EXISTS agent_memory_vectors_embedding_idx
      ON agent_memory_vectors USING hnsw (embedding vector_cosine_ops)`,
  },
  {
    name: "create_git_agents",
    sql: `CREATE TABLE IF NOT EXISTS "git_agents" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      "name" text NOT NULL,
      "slug" varchar NOT NULL,
      "description" text,
      "orchestrator_id" varchar REFERENCES orchestrators(id) ON DELETE SET NULL,
      "system_prompt" text DEFAULT '',
      "tools" jsonb DEFAULT '[]',
      "memory_enabled" boolean DEFAULT false,
      "output_config" jsonb DEFAULT '{"defaultOutputs":[]}',
      "approval_config" jsonb DEFAULT '{"required":false}',
      "is_mandatory" boolean DEFAULT false,
      "requires_admin_approval" boolean DEFAULT false,
      "is_active" boolean DEFAULT true,
      "created_at" timestamp DEFAULT now(),
      UNIQUE("workspace_id", "slug")
    )`,
  },
  {
    name: "create_git_repos",
    sql: `CREATE TABLE IF NOT EXISTS "git_repos" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      "provider" text NOT NULL,
      "repo_path" text NOT NULL,
      "repo_url" text,
      "token_encrypted" text NOT NULL,
      "webhook_secret" text NOT NULL,
      "webhook_id" text,
      "last_yml_sha" text,
      "last_yml_processed_at" timestamp,
      "is_active" boolean DEFAULT true,
      "created_at" timestamp DEFAULT now(),
      UNIQUE("workspace_id", "repo_path")
    )`,
  },
  {
    name: "create_git_agent_runs",
    sql: `CREATE TABLE IF NOT EXISTS "git_agent_runs" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "repo_id" varchar NOT NULL REFERENCES git_repos(id) ON DELETE CASCADE,
      "git_agent_id" varchar REFERENCES git_agents(id) ON DELETE SET NULL,
      "git_agent_slug" text NOT NULL,
      "task_id" varchar REFERENCES tasks(id) ON DELETE SET NULL,
      "event_type" text NOT NULL,
      "event_ref" text,
      "status" text NOT NULL DEFAULT 'pending',
      "skip_reason" text,
      "error_message" text,
      "created_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "add_git_agents_notify_channel_id",
    sql: `ALTER TABLE "git_agents" ADD COLUMN IF NOT EXISTS "notify_channel_id" varchar`,
  },
  {
    name: "add_git_agents_post_git_comment",
    sql: `ALTER TABLE "git_agents" ADD COLUMN IF NOT EXISTS "post_git_comment" boolean NOT NULL DEFAULT TRUE`,
  },
  {
    name: "add_cloud_provider_postgresql",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'postgresql'`,
  },
  {
    name: "add_vllm_provider_enum",
    sql: `ALTER TYPE "provider" ADD VALUE IF NOT EXISTS 'vllm'`,
  },
  {
    name: "add_orchestrators_vllm_api_key",
    sql: `ALTER TABLE "orchestrators" ADD COLUMN IF NOT EXISTS "vllm_api_key" text`,
  },
  {
    name: "normalize_workspace_slugs",
    sql: `UPDATE workspaces
          SET slug = lower(trim(slug))
          WHERE slug != lower(trim(slug))
            AND NOT EXISTS (
              SELECT 1 FROM workspaces w2
              WHERE lower(trim(w2.slug)) = lower(trim(workspaces.slug))
                AND w2.id != workspaces.id
            )`,
  },
  {
    name: "add_task_logs_log_type",
    sql: `ALTER TABLE "task_logs" ADD COLUMN IF NOT EXISTS "log_type" text DEFAULT 'info'`,
  },
  {
    name: "add_task_logs_parent_log_id",
    sql: `ALTER TABLE "task_logs" ADD COLUMN IF NOT EXISTS "parent_log_id" integer REFERENCES "task_logs"("id") ON DELETE SET NULL`,
  },
  {
    name: "create_global_settings",
    sql: `CREATE TABLE IF NOT EXISTS "global_settings" (
      "id" varchar PRIMARY KEY DEFAULT 'singleton',
      "app_name" text NOT NULL DEFAULT 'NanoOrch',
      "app_logo_url" text,
      "favicon_url" text,
      "updated_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "seed_global_settings",
    sql: `INSERT INTO "global_settings" (id, app_name) VALUES ('singleton', 'NanoOrch') ON CONFLICT DO NOTHING`,
  },
  {
    name: "create_provider_keys_table",
    sql: `CREATE TABLE IF NOT EXISTS "provider_keys" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" varchar REFERENCES "workspaces"("id") ON DELETE CASCADE,
      "provider" text NOT NULL,
      "encrypted_key" text NOT NULL,
      "base_url" text,
      "label" text,
      "updated_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
      "updated_at" timestamp DEFAULT now()
    )`,
  },
  {
    name: "create_provider_keys_global_index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "uix_provider_keys_global" ON "provider_keys" ("provider") WHERE "workspace_id" IS NULL`,
  },
  {
    name: "create_provider_keys_ws_index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "uix_provider_keys_ws" ON "provider_keys" ("workspace_id", "provider") WHERE "workspace_id" IS NOT NULL`,
  },
  {
    name: "add_agents_react_enabled",
    sql: `ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "react_enabled" boolean DEFAULT false`,
  },
  {
    name: "add_cloud_provider_kubernetes",
    sql: `ALTER TYPE "cloud_provider" ADD VALUE IF NOT EXISTS 'kubernetes'`,
  },
];

const IDEMPOTENT_ERROR_CODES = new Set([
  "42710", // duplicate_object  (type/enum already exists)
  "42P07", // duplicate_table   (table already exists)
  "42701", // duplicate_column  (column already exists)
  "42P16", // invalid_table_definition (e.g. constraint already exists)
  "23505", // unique_violation  (insert conflict — harmless in seeding)
  "42704", // undefined_object  (DROP of something that doesn't exist)
]);

async function applySqlFile(client: any, filePath: string, fileName: string): Promise<void> {
  if (!fileName.endsWith(".sql") || fileName.includes("..") || fileName.includes("/")) {
    throw new Error(`[migrate] Refusing to apply unsafe migration filename: ${fileName}`);
  }
  const migrationKey = `file:${fileName}`;
  const { rows } = await client.query(
    `SELECT name FROM _nanoorch_migrations WHERE name = $1`,
    [migrationKey],
  );
  if (rows.length > 0) return;

  const content = await readFile(filePath, "utf-8"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename -- filePath is join(migrationsDir, file) where file is validated to end with ".sql" without traversal
  const statements = content
    .split("-->statement-breakpoint")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);

  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (err: any) {
      if (IDEMPOTENT_ERROR_CODES.has(err.code)) {
        console.log(`[db] Skipping already-applied statement in ${fileName} (${err.code}): ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  await client.query(
    `INSERT INTO _nanoorch_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
    [migrationKey],
  );
  console.log(`[db] Applied SQL file: ${fileName}`);
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _nanoorch_migrations (
        name text PRIMARY KEY,
        applied_at timestamp DEFAULT now()
      )
    `);

    const migrationsDir = process.env.MIGRATIONS_DIR;
    if (migrationsDir && existsSync(migrationsDir)) {
      const files = (await readdir(migrationsDir))
        .filter((f: string) => f.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        await applySqlFile(client, filePath, file);
      }
    }

    for (const migration of INCREMENTAL_MIGRATIONS) {
      const { rows } = await client.query(
        `SELECT name FROM _nanoorch_migrations WHERE name = $1`,
        [migration.name],
      );
      if (rows.length > 0) continue;

      await client.query(migration.sql);
      await client.query(
        `INSERT INTO _nanoorch_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
        [migration.name],
      );
      console.log(`[db] Applied migration: ${migration.name}`);
    }
  } finally {
    client.release();
  }
}
