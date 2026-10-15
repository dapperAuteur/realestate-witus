CREATE TABLE "listing_room_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"day" date NOT NULL,
	"surface" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"exits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "listing_room_views_surface_chk" CHECK ("listing_room_views"."surface" in ('page','embed'))
);
--> statement-breakpoint
ALTER TABLE "listing_room_views" ADD CONSTRAINT "listing_room_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_room_views" ADD CONSTRAINT "listing_room_views_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_room_views" ADD CONSTRAINT "listing_room_views_scene_id_tour_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."tour_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_room_views_scene_day_surface_uq" ON "listing_room_views" USING btree ("scene_id","day","surface");--> statement-breakpoint
CREATE INDEX "listing_room_views_listing_day_idx" ON "listing_room_views" USING btree ("listing_id","day");