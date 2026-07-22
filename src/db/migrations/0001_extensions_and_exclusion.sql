-- Custom migration: what drizzle-kit cannot express.
--
-- btree_gist lets a GiST index mix scalar equality (unit_id) with range
-- overlap (stay). The exclusion constraint makes double-booking a physical
-- impossibility at the database level: no two live claims (hold, booking,
-- or blockout) can overlap on the same unit, no matter what races the
-- application layer loses. Released claims (released_at set) are exempt.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "unit_claims" ADD CONSTRAINT "unit_claims_no_overlap"
  EXCLUDE USING gist ("unit_id" WITH =, "stay" WITH &&)
  WHERE ("released_at" IS NULL);
