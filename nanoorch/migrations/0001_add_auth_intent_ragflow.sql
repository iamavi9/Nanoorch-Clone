-- Add username + password_hash to users (session-based auth)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
  END IF;
END $$;--> statement-breakpoint

-- Add intent column to tasks (docker vs in-process execution routing)
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "intent" varchar;--> statement-breakpoint

-- Add ragflow to cloud_provider enum (safe: ADD VALUE IF NOT EXISTS is supported in PG 9.6+)
ALTER TYPE "public"."cloud_provider" ADD VALUE IF NOT EXISTS 'ragflow';--> statement-breakpoint

-- Add unique constraint on workspace_members if not already present
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_id_user_id_unique') THEN
    ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_user_id_unique" UNIQUE("workspace_id","user_id");
  END IF;
END $$;
