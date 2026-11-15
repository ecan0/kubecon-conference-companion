import type { FastifyReply, FastifyRequest } from "fastify";
import { isConferenceSlug } from "@cc/shared";

/**
 * Reads `?conference=` from a catalogue request. Returns the slug, or null after
 * it has already sent a 400: `conference_required` when the parameter is absent,
 * `invalid_request` when it is not a catalogue slug. Every catalogue query is
 * scoped to one conference, so a request without one has no correct answer.
 */
export function readConference(req: FastifyRequest, reply: FastifyReply): string | null {
  const raw = (req.query as Record<string, unknown> | undefined)?.conference;
  if (raw === undefined || raw === "") {
    reply.code(400).send({ error: "conference_required" });
    return null;
  }
  if (!isConferenceSlug(raw)) {
    reply.code(400).send({ error: "invalid_request", message: "conference must be a catalogue slug" });
    return null;
  }
  return raw;
}
