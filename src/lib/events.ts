import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { pgErrorCode } from "@/lib/booking/holds";
import { db, withTx } from "@/db";
import { eventRsvps, events, tenants } from "@/db/schema";
import { sendEmail } from "@/lib/mailer";
import { err, ok, type Result } from "@/lib/result";

// Events + RSVP (workstream 8): the "museum trip Saturday, reserve your
// spot" playbook. Capacity is enforced by an atomic conditional UPDATE on
// events.rsvp_count inside the RSVP transaction — the same
// count-can-never-oversell discipline as the booking engine.

export const EVENT_KINDS = ["hotel", "cultural", "seasonal", "area"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "event"
  );
}

// ── Public ───────────────────────────────────────────────────────────────────

export async function listUpcomingEvents(tenantId: string, limit = 20) {
  return db()
    .select()
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.isPublished, true),
        gte(events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);
}

export interface RsvpInput {
  name: string;
  email: string;
  phone?: string;
  partySize: number;
}

/**
 * Free RSVP with race-safe capacity: the conditional count UPDATE is the
 * FIRST write — if the event is full (or unpublished, past, or not
 * RSVP-able) zero rows update and nothing else happens.
 */
export async function submitRsvp(
  tenantId: string,
  eventId: string,
  input: RsvpInput,
): Promise<Result<{ rsvpId: string }>> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err("INVALID_GUEST", "Give us your name and a valid email.");
  }
  const partySize = Math.round(input.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 10) {
    return err("INVALID_PARTY", "Party size must be between 1 and 10.");
  }

  const result = await withTx(async (tx) => {
    const [existing] = await tx
      .select({ id: eventRsvps.id })
      .from(eventRsvps)
      .where(
        and(
          eq(eventRsvps.eventId, eventId),
          eq(eventRsvps.email, email),
          eq(eventRsvps.status, "confirmed"),
        ),
      )
      .limit(1);
    if (existing) {
      return err("ALREADY_RSVPED", "This email already has a spot reserved.");
    }

    const updated = await tx
      .update(events)
      .set({ rsvpCount: sql`${events.rsvpCount} + ${partySize}` })
      .where(
        and(
          eq(events.id, eventId),
          eq(events.tenantId, tenantId),
          eq(events.isPublished, true),
          eq(events.rsvpMode, "free_rsvp"),
          gte(events.startsAt, new Date()),
          sql`(${events.capacity} is null or ${events.rsvpCount} + ${partySize} <= ${events.capacity})`,
        ),
      )
      .returning({ id: events.id, title: events.title, startsAt: events.startsAt });
    if (updated.length === 0) {
      return err("EVENT_FULL", "This event is full or no longer taking reservations.");
    }

    const [rsvp] = await tx
      .insert(eventRsvps)
      .values({
        eventId,
        name,
        email,
        phone: input.phone?.trim() || null,
        partySize,
      })
      .returning({ id: eventRsvps.id });
    return ok({ rsvpId: rsvp.id, event: updated[0] });
  });

  if (result.ok) {
    // Best-effort confirmation email; the spot is held regardless.
    try {
      const [tenant] = await db()
        .select({ emailCfg: tenants.email, name: tenants.name, theme: tenants.theme })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      const brand = tenant?.theme.name ?? tenant?.name ?? "the hotel";
      await sendEmail({
        to: email,
        from: tenant?.emailCfg.from,
        subject: `You're on the list: ${result.data.event.title}`,
        text: `Hello ${name},\n\nYour spot (party of ${partySize}) is reserved for "${result.data.event.title}" at ${brand}.\n\nSee you there.`,
      });
    } catch {
      /* best-effort */
    }
    return ok({ rsvpId: result.data.rsvpId });
  }
  return result;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface EventInput {
  title: string;
  description: string;
  kind: EventKind;
  startsAt: Date;
  locationText: string;
  capacity: number | null;
  rsvpMode: "none" | "free_rsvp";
  isPublished: boolean;
}

function validateEvent(input: EventInput): Result<EventInput> {
  if (!input.title.trim()) return err("INVALID_TITLE", "Give the event a title.");
  if (Number.isNaN(input.startsAt.getTime())) {
    return err("INVALID_DATE", "Pick a valid date and time.");
  }
  if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
    return err("INVALID_CAPACITY", "Capacity must be a positive number or empty.");
  }
  return ok(input);
}

export async function listEventsAdmin(tenantId: string) {
  return db()
    .select()
    .from(events)
    .where(eq(events.tenantId, tenantId))
    .orderBy(desc(events.startsAt))
    .limit(100);
}

export async function createEvent(
  tenantId: string,
  input: EventInput,
): Promise<Result<{ id: string }>> {
  const valid = validateEvent(input);
  if (!valid.ok) return valid;
  const base = slugify(input.title);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      const [row] = await db()
        .insert(events)
        .values({
          tenantId,
          slug,
          title: input.title.trim(),
          description: input.description.trim() || null,
          kind: input.kind,
          startsAt: input.startsAt,
          locationText: input.locationText.trim() || null,
          capacity: input.capacity,
          rsvpMode: input.rsvpMode,
          isPublished: input.isPublished,
        })
        .returning({ id: events.id });
      return ok({ id: row.id });
    } catch (error) {
      if (pgErrorCode(error) !== "23505" || attempt === 3) throw error;
    }
  }
  return err("GENERIC", "Could not save the event. Please try again.");
}

export async function updateEvent(
  tenantId: string,
  eventId: string,
  input: EventInput,
): Promise<Result<{ updated: boolean }>> {
  const valid = validateEvent(input);
  if (!valid.ok) return valid;
  const rows = await db()
    .update(events)
    .set({
      title: input.title.trim(),
      description: input.description.trim() || null,
      kind: input.kind,
      startsAt: input.startsAt,
      locationText: input.locationText.trim() || null,
      capacity: input.capacity,
      rsvpMode: input.rsvpMode,
      isPublished: input.isPublished,
      updatedAt: new Date(),
    })
    .where(and(eq(events.id, eventId), eq(events.tenantId, tenantId)))
    .returning({ id: events.id });
  if (rows.length === 0) return err("NOT_FOUND", "Event not found.");
  return ok({ updated: true });
}

export async function deleteEvent(
  tenantId: string,
  eventId: string,
): Promise<Result<{ deleted: boolean }>> {
  const rows = await db()
    .delete(events)
    .where(and(eq(events.id, eventId), eq(events.tenantId, tenantId)))
    .returning({ id: events.id });
  return ok({ deleted: rows.length > 0 });
}

export async function listRsvps(tenantId: string, eventId: string) {
  // Tenant guard via the join: rsvps have no tenant column of their own.
  return db()
    .select({
      id: eventRsvps.id,
      name: eventRsvps.name,
      email: eventRsvps.email,
      phone: eventRsvps.phone,
      partySize: eventRsvps.partySize,
      status: eventRsvps.status,
      createdAt: eventRsvps.createdAt,
    })
    .from(eventRsvps)
    .innerJoin(events, eq(eventRsvps.eventId, events.id))
    .where(and(eq(events.id, eventId), eq(events.tenantId, tenantId)))
    .orderBy(asc(eventRsvps.createdAt));
}

/** Cancel frees the seats in the same transaction. */
export async function cancelRsvp(
  tenantId: string,
  rsvpId: string,
): Promise<Result<{ cancelled: boolean }>> {
  return withTx(async (tx) => {
    const [row] = await tx
      .select({
        id: eventRsvps.id,
        eventId: eventRsvps.eventId,
        partySize: eventRsvps.partySize,
        status: eventRsvps.status,
        tenantId: events.tenantId,
      })
      .from(eventRsvps)
      .innerJoin(events, eq(eventRsvps.eventId, events.id))
      .where(eq(eventRsvps.id, rsvpId))
      .for("update")
      .limit(1);
    if (!row || row.tenantId !== tenantId) {
      return err("NOT_FOUND", "Reservation not found.");
    }
    if (row.status === "cancelled") return ok({ cancelled: false });

    await tx
      .update(eventRsvps)
      .set({ status: "cancelled" })
      .where(eq(eventRsvps.id, row.id));
    await tx
      .update(events)
      .set({ rsvpCount: sql`greatest(${events.rsvpCount} - ${row.partySize}, 0)` })
      .where(eq(events.id, row.eventId));
    return ok({ cancelled: true });
  });
}
