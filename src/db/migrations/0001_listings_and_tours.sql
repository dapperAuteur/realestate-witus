CREATE TYPE "public"."inquiry_kind" AS ENUM('tour_request', 'question');--> statement-breakpoint
CREATE TYPE "public"."inquiry_source" AS ENUM('tour', 'action_panel', 'form');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'for_sale', 'under_offer', 'sold', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."property_kind" AS ENUM('single_family', 'multi_family', 'commercial', 'campus', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."scene_status" AS ENUM('draft', 'published', 'unpublished');--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"kind" "inquiry_kind" NOT NULL,
	"source" "inquiry_source" NOT NULL,
	"surface" text DEFAULT 'page' NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text,
	"message" text,
	"preferred_times" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_inquiries_surface_chk" CHECK ("listing_inquiries"."surface" in ('page','embed')),
	CONSTRAINT "listing_inquiries_status_chk" CHECK ("listing_inquiries"."status" in ('new','replied','closed'))
);
--> statement-breakpoint
CREATE TABLE "listing_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_photos_listing_media_uq" UNIQUE("listing_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "listing_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"day" date NOT NULL,
	"surface" text NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"tour_opens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "listing_views_listing_day_surface_uq" UNIQUE("listing_id","day","surface"),
	CONSTRAINT "listing_views_surface_chk" CHECK ("listing_views"."surface" in ('page','embed'))
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"building_id" uuid,
	"unit_id" uuid,
	"slug" "citext" NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"price_minor" bigint,
	"currency" text DEFAULT 'USD' NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hide_address" boolean DEFAULT false NOT NULL,
	"agent_user_id" text,
	"tour_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_slug_unique" UNIQUE("slug"),
	CONSTRAINT "listings_unit_needs_building_chk" CHECK ("listings"."unit_id" is null or "listings"."building_id" is not null),
	CONSTRAINT "listings_price_chk" CHECK ("listings"."price_minor" is null or "listings"."price_minor" >= 0),
	CONSTRAINT "listings_currency_chk" CHECK ("listings"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "property_kind" DEFAULT 'single_family' NOT NULL,
	"name" text,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"neighborhood" text,
	"locality" text,
	"region" text,
	"postal_code" text,
	"country_code" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_country_code_chk" CHECK ("properties"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_hotspots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"yaw" real NOT NULL,
	"pitch" real NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"external_url" text,
	"moment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"from_scene_id" uuid NOT NULL,
	"to_scene_id" uuid NOT NULL,
	"name" text,
	"yaw" real,
	"pitch" real,
	"arrival_yaw" real,
	"arrival_pitch" real,
	"arrow_rotation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_links_not_self_chk" CHECK ("scene_links"."from_scene_id" <> "scene_links"."to_scene_id"),
	CONSTRAINT "scene_links_arrow_rotation_chk" CHECK ("scene_links"."arrow_rotation" between 0 and 345 and "scene_links"."arrow_rotation" % 15 = 0)
);
--> statement-breakpoint
CREATE TABLE "scene_moment_panoramas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"moment_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"heading_offset_deg" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_moment_panoramas_heading_chk" CHECK ("scene_moment_panoramas"."heading_offset_deg" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "tour_floor_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"media_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tour_floor_plans_label_chk" CHECK (char_length("tour_floor_plans"."label") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "tour_moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"label" text NOT NULL,
	"occurred_on" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tour_moments_label_chk" CHECK (char_length("tour_moments"."label") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "tour_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"name" text NOT NULL,
	"caption" text,
	"panorama_media_id" uuid NOT NULL,
	"poster_media_id" uuid,
	"start_yaw" real,
	"start_pitch" real,
	"roll_offset_deg" real,
	"min_pitch_deg" real,
	"floor_plan_id" uuid,
	"map_x" real,
	"map_y" real,
	"order_index" integer,
	"is_start" boolean DEFAULT false NOT NULL,
	"status" "scene_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tour_scenes_map_position_chk" CHECK (("tour_scenes"."map_x" is null or "tour_scenes"."map_x" between 0 and 1) and ("tour_scenes"."map_y" is null or "tour_scenes"."map_y" between 0 and 1)),
	CONSTRAINT "tour_scenes_min_pitch_chk" CHECK ("tour_scenes"."min_pitch_deg" is null or "tour_scenes"."min_pitch_deg" between -85 and 0),
	CONSTRAINT "tour_scenes_roll_chk" CHECK ("tour_scenes"."roll_offset_deg" is null or "tour_scenes"."roll_offset_deg" between -15 and 15)
);
--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_inquiries" ADD CONSTRAINT "listing_inquiries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_inquiries" ADD CONSTRAINT "listing_inquiries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_scene_id_tour_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."tour_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_moment_id_tour_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."tour_moments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_links" ADD CONSTRAINT "scene_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_links" ADD CONSTRAINT "scene_links_from_scene_id_tour_scenes_id_fk" FOREIGN KEY ("from_scene_id") REFERENCES "public"."tour_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_links" ADD CONSTRAINT "scene_links_to_scene_id_tour_scenes_id_fk" FOREIGN KEY ("to_scene_id") REFERENCES "public"."tour_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_moment_panoramas" ADD CONSTRAINT "scene_moment_panoramas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_moment_panoramas" ADD CONSTRAINT "scene_moment_panoramas_scene_id_tour_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."tour_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_moment_panoramas" ADD CONSTRAINT "scene_moment_panoramas_moment_id_tour_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."tour_moments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_moment_panoramas" ADD CONSTRAINT "scene_moment_panoramas_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_floor_plans" ADD CONSTRAINT "tour_floor_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_floor_plans" ADD CONSTRAINT "tour_floor_plans_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_floor_plans" ADD CONSTRAINT "tour_floor_plans_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_moments" ADD CONSTRAINT "tour_moments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_moments" ADD CONSTRAINT "tour_moments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_panorama_media_id_media_assets_id_fk" FOREIGN KEY ("panorama_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_poster_media_id_media_assets_id_fk" FOREIGN KEY ("poster_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_floor_plan_id_tour_floor_plans_id_fk" FOREIGN KEY ("floor_plan_id") REFERENCES "public"."tour_floor_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buildings_property_idx" ON "buildings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "listing_inquiries_tenant_created_idx" ON "listing_inquiries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_inquiries_listing_idx" ON "listing_inquiries" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_photos_listing_idx" ON "listing_photos" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listings_tenant_idx" ON "listings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "listings_property_idx" ON "listings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "listings_tenant_status_idx" ON "listings" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "properties_tenant_idx" ON "properties" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "units_building_idx" ON "units" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "scene_hotspots_scene_idx" ON "scene_hotspots" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "scene_links_from_idx" ON "scene_links" USING btree ("from_scene_id");--> statement-breakpoint
CREATE INDEX "scene_links_to_idx" ON "scene_links" USING btree ("to_scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scene_moment_panoramas_scene_moment_unique" ON "scene_moment_panoramas" USING btree ("scene_id","moment_id");--> statement-breakpoint
CREATE INDEX "scene_moment_panoramas_moment_idx" ON "scene_moment_panoramas" USING btree ("moment_id");--> statement-breakpoint
CREATE INDEX "tour_floor_plans_listing_idx" ON "tour_floor_plans" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "tour_moments_listing_idx" ON "tour_moments" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tour_moments_one_base_per_listing" ON "tour_moments" USING btree ("listing_id") WHERE "tour_moments"."is_base";--> statement-breakpoint
CREATE INDEX "tour_scenes_listing_idx" ON "tour_scenes" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tour_scenes_one_start_per_listing" ON "tour_scenes" USING btree ("listing_id") WHERE "tour_scenes"."is_start";