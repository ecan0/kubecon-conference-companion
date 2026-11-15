import type { FastifyInstance } from "fastify";
import { routes, type CatalogTopicsResponse } from "@cc/shared";
import type { Db } from "../db/client.js";
import { runQuery } from "../search/errors.js";
import { DEFAULT_RATE_LIMITS, applyRateLimit, limitFor, type RouteLimit } from "../http/rateLimit.js";
import { readConference } from "../http/conference.js";
import { withSpan } from "../telemetry/span.js";

/** Catalog tags only change on reseed; serve them from memory for this long. */
export const CATALOG_CACHE_MS = 30_000;

export interface CatalogRouteOptions {
  /** Per-IP limit; defaults to DEFAULT_RATE_LIMITS.catalogTopics. */
  rateLimit?: RouteLimit;
  now?: () => number;
}

/** Most tags returned, as before. `collate "C"` keeps the order identical to a plain string sort. */
export const MAX_TOPICS = 1000;

async function loadTopics(db: Db, conference: string): Promise<CatalogTopicsResponse> {
  const rows = await runQuery<{ tag: string }>(
    db,
    `select distinct tag collate "C" as tag from talks, unnest(tags) as tag
     where conference = $1 and btrim(tag) <> '' order by 1 limit ${MAX_TOPICS}`,
    [conference],
  );
  return { topics: [...new Set(rows.map(({ tag }) => tag).filter((tag) => typeof tag === "string" && tag.trim().length > 0))].sort() };
}

/** Public read of catalog metadata only; never queries attendee interests. Own plugin scope (rate limited, cached). */
export function registerCatalogRoutes(root: FastifyInstance, db: Db, opts: CatalogRouteOptions = {}): void {
  root.register(async (app) => {
    await applyRateLimit(app);
    const now = opts.now ?? Date.now;
    const cached = new Map<string, { at: number; value: CatalogTopicsResponse }>();
    const inflight = new Map<string, Promise<CatalogTopicsResponse>>();

    const limit = limitFor(opts.rateLimit ?? DEFAULT_RATE_LIMITS.catalogTopics);
    app.get(routes.catalogTopics.path, limit, async (req, reply): Promise<CatalogTopicsResponse | void> => {
      const conference = readConference(req, reply);
      if (conference === null) return reply;
      try {
        return await withSpan("catalog.topics", {
          "db.system": "postgresql", "db.namespace": "talks", "db.operation.name": "select",
        }, async () => {
          // Only successful responses are cached, so a database outage is not pinned for 30 s.
          let entry = cached.get(conference);
          if (!entry || now() - entry.at >= CATALOG_CACHE_MS) {
            let pending = inflight.get(conference);
            if (!pending) {
              pending = loadTopics(db, conference).finally(() => {
                inflight.delete(conference);
              });
              inflight.set(conference, pending);
            }
            entry = { at: now(), value: await pending };
            cached.set(conference, entry);
          }
          reply.header("cache-control", `public, max-age=${CATALOG_CACHE_MS / 1000}`);
          return entry.value;
        });
      } catch {
        // Driver errors can echo data; expose only a stable error code.
        return reply.code(503).send({ error: "catalog_unavailable" });
      }
    });
  });
}
