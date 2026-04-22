CREATE TYPE "public"."channel_type" AS ENUM('webhook', 'api');--> statement-breakpoint
CREATE TYPE "public"."cloud_provider" AS ENUM('aws', 'gcp', 'azure', 'ragflow');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."orchestrator_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('openai', 'anthropic', 'gemini');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "agent_memory" (
        "id" serial PRIMARY KEY NOT NULL,
        "agent_id" varchar NOT NULL,
        "key" varchar NOT NULL,
        "value" text,
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "agent_memory_agent_key" UNIQUE("agent_id","key")
);
--> statement-breakpoint
CREATE TABLE "agents" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "orchestrator_id" varchar NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "instructions" text,
        "tools" jsonb DEFAULT '[]'::jsonb,
        "memory_enabled" boolean DEFAULT false,
        "max_tokens" integer DEFAULT 4096,
        "temperature" integer DEFAULT 70,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "channels" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "orchestrator_id" varchar NOT NULL,
        "name" text NOT NULL,
        "type" "channel_type" DEFAULT 'api' NOT NULL,
        "config" jsonb DEFAULT '{}'::jsonb,
        "api_key" varchar DEFAULT gen_random_uuid(),
        "is_active" boolean DEFAULT true,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "workspace_id" varchar NOT NULL,
        "title" text DEFAULT 'Chat' NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "conversation_id" varchar NOT NULL,
        "role" text NOT NULL,
        "agent_id" varchar,
        "agent_name" text,
        "content" text NOT NULL,
        "mentions" text[] DEFAULT '{}',
        "message_type" text DEFAULT 'text' NOT NULL,
        "metadata" jsonb DEFAULT '{}'::jsonb,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cloud_integrations" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "workspace_id" varchar NOT NULL,
        "name" text NOT NULL,
        "provider" "cloud_provider" NOT NULL,
        "credentials_encrypted" text NOT NULL,
        "scopes" text[] DEFAULT '{}',
        "is_active" boolean DEFAULT true,
        "created_at" timestamp DEFAULT now(),
        "last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "orchestrators" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "workspace_id" varchar NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "provider" "provider" DEFAULT 'openai' NOT NULL,
        "model" varchar DEFAULT 'gpt-4o' NOT NULL,
        "system_prompt" text,
        "max_concurrency" integer DEFAULT 3,
        "max_retries" integer DEFAULT 2,
        "timeout_seconds" integer DEFAULT 120,
        "status" "orchestrator_status" DEFAULT 'active',
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "task_id" varchar NOT NULL,
        "level" "log_level" DEFAULT 'info',
        "message" text NOT NULL,
        "metadata" jsonb DEFAULT '{}'::jsonb,
        "timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "orchestrator_id" varchar NOT NULL,
        "agent_id" varchar,
        "channel_id" varchar,
        "input" text NOT NULL,
        "output" text,
        "status" "task_status" DEFAULT 'pending',
        "priority" integer DEFAULT 5,
        "intent" varchar,
        "error_message" text,
        "created_at" timestamp DEFAULT now(),
        "started_at" timestamp,
        "completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "username" varchar,
        "password_hash" text,
        "email" varchar,
        "name" text,
        "role" "user_role" DEFAULT 'member',
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "users_username_unique" UNIQUE("username"),
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
        "id" serial PRIMARY KEY NOT NULL,
        "workspace_id" varchar NOT NULL,
        "user_id" varchar NOT NULL,
        "role" "user_role" DEFAULT 'member',
        CONSTRAINT "workspace_members_workspace_id_user_id_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "slug" varchar NOT NULL,
        "description" text,
        "owner_id" varchar,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_integrations" ADD CONSTRAINT "cloud_integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
