CREATE TABLE "ml_faq" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"keywords" text,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_question" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ml_question_id" text NOT NULL,
	"item_id" text,
	"item_title" text,
	"buyer_identity" text,
	"question" text NOT NULL,
	"answer" text,
	"draft" text,
	"status" text DEFAULT 'unanswered' NOT NULL,
	"source" text,
	"asked_at" timestamp NOT NULL,
	"answered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ml_faq" ADD CONSTRAINT "ml_faq_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_question" ADD CONSTRAINT "ml_question_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ml_faq_org_idx" ON "ml_faq" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ml_question_org_mlid_uq" ON "ml_question" USING btree ("organization_id","ml_question_id");--> statement-breakpoint
CREATE INDEX "ml_question_org_status_idx" ON "ml_question" USING btree ("organization_id","status","asked_at");