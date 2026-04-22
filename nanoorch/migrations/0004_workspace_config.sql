CREATE TABLE IF NOT EXISTS "workspace_config" (
  "workspace_id" varchar PRIMARY KEY NOT NULL,
  "max_orchestrators" integer,
  "max_agents" integer,
  "max_channels" integer,
  "max_scheduled_jobs" integer,
  "allowed_ai_providers" text[],
  "allowed_cloud_providers" text[],
  "allowed_channel_types" text[],
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "workspace_config" ADD CONSTRAINT "workspace_config_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
