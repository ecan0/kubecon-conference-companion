import type { Talk } from "@cc/shared";

/**
 * Fixture talk on a fixed, far-future day: registration is refused once every talk of a conference has
 * ended (routes/register.ts), and these fixtures are used with the real clock, so the dates must stay
 * ahead of it. The day is arbitrary; only the relative hours matter. Callers that need an ended event
 * override `start`/`end`.
 */
export function talk(id: string, startHour: number, endHour: number, extra: Partial<Talk> = {}): Talk {
  const iso = (h: number) => new Date(Date.UTC(2030, 10, 10, 0, 0) + h * 3600_000).toISOString();
  return {
    id,
    title: `Talk ${id}`,
    speaker: "Someone",
    abstract: "About things.",
    track: "Security",
    room: "Hall A",
    start: iso(startHour),
    end: iso(endHour),
    tags: ["x"],
    ...extra,
  };
}
