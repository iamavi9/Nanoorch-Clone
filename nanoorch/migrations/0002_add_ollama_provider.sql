-- Add ollama to provider enum
ALTER TYPE "public"."provider" ADD VALUE IF NOT EXISTS 'ollama';--> statement-breakpoint

-- Add base_url column to orchestrators (for Ollama and future custom endpoints)
ALTER TABLE "orchestrators" ADD COLUMN IF NOT EXISTS "base_url" text;
