ALTER TABLE "message" ADD COLUMN "provider" text DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "external_message_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "whatsapp_provider" text DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "evolution_api_url" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "evolution_api_key" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "evolution_instance" text;