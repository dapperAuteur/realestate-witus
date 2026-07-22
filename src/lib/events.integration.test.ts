// Events + RSVP against Neon (skips without a DB URL): the capacity race is
// the headline — two concurrent RSVPs for the last spots cannot both land.
// Throwaway tenant, cascade-deleted.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { events, tenants } from "@/db/schema";
import {
  cancelRsvp,
  createEvent,
  listRsvps,
  submitRsvp,
} from "./events";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

function starts(daysAhead: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d;
}

describe.skipIf(!hasDb)("events + RSVP against Neon", () => {
  let tenantId: string;
  let eventId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({
        slug: `itest-events-${randomUUID().slice(0, 8)}`,
        name: "Events Test Hotel",
        flags: { events: true },
      })
      .returning({ id: tenants.id });
    tenantId = tenant.id;

    const created = await createEvent(tenantId, {
      title: "Capacity Test Night",
      description: "",
      kind: "hotel",
      startsAt: starts(7),
      locationText: "Rooftop",
      capacity: 3,
      rsvpMode: "free_rsvp",
      isPublished: true,
    });
    if (!created.ok) throw new Error(created.code);
    eventId = created.data.id;
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("two concurrent RSVPs racing for the last spots: exactly one wins", async () => {
    // Take 1 of 3 spots first, leaving 2.
    const first = await submitRsvp(tenantId, eventId, {
      name: "Guest One",
      email: "one@example.com",
      partySize: 1,
    });
    expect(first.ok).toBe(true);

    // Two parties of 2 race for the remaining 2 spots.
    const [a, b] = await Promise.all([
      submitRsvp(tenantId, eventId, { name: "Guest A", email: "a@example.com", partySize: 2 }),
      submitRsvp(tenantId, eventId, { name: "Guest B", email: "b@example.com", partySize: 2 }),
    ]);
    const wins = [a, b].filter((r) => r.ok);
    const losses = [a, b].filter((r) => !r.ok);
    expect(wins).toHaveLength(1);
    expect(losses[0]).toMatchObject({ ok: false, code: "EVENT_FULL" });

    const [row] = await db()
      .select({ rsvpCount: events.rsvpCount })
      .from(events)
      .where(eq(events.id, eventId));
    expect(row.rsvpCount).toBe(3);
  });

  it("duplicate email is rejected; cancel frees the seats back", async () => {
    expect(
      await submitRsvp(tenantId, eventId, {
        name: "Guest One Again",
        email: "ONE@example.com".toLowerCase(),
        partySize: 1,
      }),
    ).toMatchObject({ ok: false, code: "ALREADY_RSVPED" });

    const rsvps = await listRsvps(tenantId, eventId);
    const winner = rsvps.find((r) => r.partySize === 2 && r.status === "confirmed");
    expect(winner).toBeTruthy();

    const cancelled = await cancelRsvp(tenantId, winner!.id);
    expect(cancelled).toMatchObject({ ok: true, data: { cancelled: true } });
    const [row] = await db()
      .select({ rsvpCount: events.rsvpCount })
      .from(events)
      .where(eq(events.id, eventId));
    expect(row.rsvpCount).toBe(1);

    // Freed seats are bookable again.
    const again = await submitRsvp(tenantId, eventId, {
      name: "Guest C",
      email: "c@example.com",
      partySize: 2,
    });
    expect(again.ok).toBe(true);
  });

  it("wrong tenant cannot cancel another hotel's RSVP", async () => {
    const rsvps = await listRsvps(tenantId, eventId);
    const target = rsvps.find((r) => r.status === "confirmed");
    expect(
      await cancelRsvp(randomUUID(), target!.id),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
