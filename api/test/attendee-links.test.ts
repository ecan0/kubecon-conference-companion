import { describe, expect, it } from "vitest";
import type { Db } from "../src/db/client.js";
import { createTokenService } from "../src/auth/token.js";
import { loadConfig } from "../src/config.js";
import { LocalHashEmbedder } from "../src/embed/hash.js";
import { buildServer } from "../src/server.js";
import { AttendeeGoneError, createScheduleStore } from "../src/search/service.js";
import { testDb } from "./pg.js";
import { seededDb } from "./search-fixtures.js";

const NOW = new Date("2026-11-10T07:00:00.000Z");
const FAR_FUTURE = "9999-12-31T23:59:59.999Z";
const KEY = "x".repeat(48); // test-only signing key; not a credential

async function addAttendee(db: Db, id: string): Promise<void> {
  await db.query(
    `insert into attendees (id, display_name, interests, consent_cluster_map, consent_qr_checkin, created_at, expires_at)
     values ($1, 'x', '{}', false, false, now(), $2)`,
    [id, FAR_FUTURE],
  );
}

async function linkedRows(db: Db, table: string, attendeeId: string): Promise<number> {
  const r = await db.query<{ n: number }>(`select count(*)::int as n from ${table} where attendee_id = $1`, [attendeeId]);
  return r.rows[0]!.n;
}

describe("attendee-linked rows", () => {
  it("refuses a schedule for an attendee that does not exist and stores nothing", async () => {
    const db = await testDb();
    await expect(createScheduleStore(db).save("ghost", [], NOW)).rejects.toBeInstanceOf(AttendeeGoneError);
    expect(await linkedRows(db, "schedules", "ghost")).toBe(0);
  });

  it("saves a schedule for a live attendee", async () => {
    const db = await testDb();
    await addAttendee(db, "ada-1");
    const store = createScheduleStore(db);
    await store.save("ada-1", ["a"], NOW);
    expect((await store.load("ada-1", NOW))?.talkIds).toEqual(["a"]);
  });

  it("removes schedule, entitlement and identity rows with their attendee", async () => {
    const db = await testDb();
    await addAttendee(db, "ada-1");
    await db.query("insert into schedules (attendee_id, talk_ids, updated_at, expires_at) values ($1, '{a}', now(), $2)", ["ada-1", FAR_FUTURE]);
    await db.query(
      "insert into entitlements (attendee_id, pass_type, rooms, updated_at, expires_at) values ($1, 'day', '{}', now(), $2)",
      ["ada-1", FAR_FUTURE],
    );
    await db.query("insert into identities (id, attendee_id, created_at, expires_at) values ('hmac-ada', $1, now(), $2)", ["ada-1", FAR_FUTURE]);

    await db.query("delete from attendees where id = $1", ["ada-1"]);

    expect(await linkedRows(db, "schedules", "ada-1")).toBe(0);
    expect(await linkedRows(db, "entitlements", "ada-1")).toBe(0);
    expect(await linkedRows(db, "identities", "ada-1")).toBe(0);
  });

  it("answers 404 and stores nothing when the attendee is deleted after the route's existence check", async () => {
    const raw = await seededDb();
    await addAttendee(raw, "victim-7");
    // The delete lands between the route's existence check and the schedule write.
    const racing: Db = {
      ...raw,
      query: async <T extends object>(text: string, params: readonly unknown[] = []) => {
        if (text.startsWith("insert into schedules")) await raw.query("delete from attendees where id = $1", ["victim-7"]);
        return raw.query<T>(text, params);
      },
    };
    const tokens = createTokenService({ key: KEY, now: () => NOW.getTime() });
    const app = buildServer(loadConfig({}), { db: racing, embedder: new LocalHashEmbedder(), tokens, search: { now: () => NOW } });

    const res = await app.inject({
      method: "POST",
      url: "/api/schedule",
      headers: { authorization: `Bearer ${(await tokens.sign("victim-7")).token}` },
      payload: { talkIds: ["a"] },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "not_found" });
    expect(await linkedRows(raw, "schedules", "victim-7")).toBe(0);
  });
});
