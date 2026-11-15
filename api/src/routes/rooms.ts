import type { FastifyInstance } from "fastify";
import { routes } from "@cc/shared";
import type { Db } from "../db/client.js";
import { applyRateLimit, limitFor } from "../http/rateLimit.js";
import { readConference } from "../http/conference.js";
import { runQuery } from "../search/errors.js";
import type { RoomActivityCounter } from "../rooms/activity.js";
import { withSpan } from "../telemetry/span.js";

export function registerRoomRoutes(root: FastifyInstance, db: Db, counter: RoomActivityCounter, perMinute = 120, now = Date.now): void {
  const catalogs = new Map<string, { at: number; rooms: string[] }>();
  const inflight = new Map<string, Promise<string[]>>();
  async function catalogRooms(conference: string): Promise<string[]> {
    const cached = catalogs.get(conference);
    if (cached && now() - cached.at < 60_000) return cached.rooms;
    const pending = inflight.get(conference);
    if (pending) return pending;
    const p = (async () => {
      const rows = await runQuery<{ room: string }>(
        db,
        "select distinct room from talks where conference = $1 and room is not null and room <> '' order by room",
        [conference],
      );
      const rooms = rows.map(({ room }) => room);
      catalogs.set(conference, { at: now(), rooms });
      return rooms;
    })().finally(() => { inflight.delete(conference); });
    inflight.set(conference, p);
    return p;
  }
  root.register(async (app) => {
    await applyRateLimit(app);
    app.get(routes.roomOccupancy.path, limitFor({ max: perMinute }), async (req, reply) => {
      const conference = readConference(req, reply);
      if (conference === null) return reply;
      try {
        return await withSpan("rooms.occupancy", {}, async () => {
          reply.header("cache-control", "no-store");
          return counter.snapshot(await catalogRooms(conference));
        });
      } catch { return reply.code(503).send({ error: "room_activity_unavailable" }); }
    });
  });
}
