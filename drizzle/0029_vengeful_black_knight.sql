CREATE TABLE "ml_trend_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"site_id" text NOT NULL,
	"payload" text NOT NULL,
	"analysis" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ml_credentials" ADD COLUMN "site_id" text;--> statement-breakpoint
ALTER TABLE "ml_trend_cache" ADD CONSTRAINT "ml_trend_cache_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ml_trend_cache_org_site_uq" ON "ml_trend_cache" USING btree ("organization_id","site_id");