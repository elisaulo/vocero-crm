ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "external_message_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "whatsapp_provider" text DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "evolution_api_url" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "evolution_api_key" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "evolution_instance" text;