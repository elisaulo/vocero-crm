CREATE TABLE "ml_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ml_user_id" text NOT NULL,
	"nickname" text,
	"access_token_cipher" text NOT NULL,
	"access_token_iv" text NOT NULL,
	"access_token_tag" text NOT NULL,
	"refresh_token_cipher" text NOT NULL,
	"refresh_token_iv" text NOT NULL,
	"refresh_token_tag" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"scope" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "conversation_org_contact_real_uq";--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "evolution_instance" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "provider" text DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "external_message_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "whatsapp_provider" text DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "evolution_api_url" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "evolution_api_key" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "evolution_instance" text;--> statement-breakpoint
ALTER TABLE "ml_credentials" ADD CONSTRAINT "ml_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ml_credentials_org_uq" ON "ml_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ml_credentials_user_uq" ON "ml_credentials" USING btree ("ml_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_org_contact_no_evo_uq" ON "conversation" USING btree ("organization_id","contact_id") WHERE "conversation"."is_test" = false AND "conversation"."evolution_instance" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_org_contact_evo_uq" ON "conversation" USING btree ("organization_id","contact_id","evolution_instance") WHERE "conversation"."is_test" = false AND "conversation"."evolution_instance" IS NOT NULL;