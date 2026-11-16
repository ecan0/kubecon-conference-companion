import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { isConferenceSlug } from "@cc/shared";
import { api, ApiError } from "../api.js";
import { withConference } from "../conferenceLink.js";
import "./page-state.css";

/**
 * Shared loading, empty and error states for attendee pages.
 * Loading and empty states are polite live regions (role="status");
 * errors are announced immediately (role="alert"). Callers pass their own
 * friendly copy: raw API error text is never rendered.
 */
export function LoadingState({ children = "Loading…" }: { children?: ReactNode }) {
  return <p role="status" className="page-state page-state-loading">{children}</p>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div role="status" className="page-state page-state-empty">{children}</div>;
}

export function ErrorState({ children, onRetry, retryLabel = "Try again" }: {
  children: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return <div className="page-state page-state-error">
    <p role="alert">{children}</p>
    {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
  </div>;
}

export function SessionExpiredState() {
  const { search } = useLocation();
  return <div className="page-state page-state-error">
    <p role="alert">Your session has expired. <a href={withConference("/site/register.html", search)}>Register again</a> to continue.</p>
  </div>;
}

/**
 * Shown by attendee pages whose address carries no `?c=` conference: no event is assumed,
 * so the page points at the conference list instead of querying the API for an unknown event.
 */
export function NoConferenceState() {
  return <div role="status" className="page-state page-state-empty">
    <p>Choose a conference first. <a href="/site/#conferences">Open the conference list</a></p>
  </div>;
}

/** The `?c=` conference slug of the current address, or null when none (or no valid slug) is set. */
export function conferenceSlug(search: string): string | null {
  const slug = new URLSearchParams(search).get("c");
  return isConferenceSlug(slug) ? slug : null;
}

/** True when the error is an API 401, i.e. a missing or expired session. */
export function isSessionExpired(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** The catalogue facts a page needs to name an event, tell whether it is over, and point at its official site. */
export interface ConferenceInfo {
  slug: string;
  name: string;
  url?: string;
  /** Calendar day of the event's first day (YYYY-MM-DD), as the catalogue states it. */
  startDate?: string;
  /** Calendar day of the event's last day (YYYY-MM-DD): registration closes once it has passed. */
  endDate?: string;
}

let cataloguePromise: Promise<ConferenceInfo[]> | null = null;

/** Catalogue events (the same list as /site/#conferences), fetched once; `[]` when it cannot be read. */
function conferenceCatalogue(): Promise<ConferenceInfo[]> {
  cataloguePromise ??= (async () => {
    try {
      const res = await fetch("/site/data/conferences.json", { headers: { accept: "application/json" } });
      if (!res.ok) return [];
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return [];
      return data.flatMap((entry): ConferenceInfo[] => {
        if (!entry || typeof entry !== "object") return [];
        const { slug, name, url, startDate, endDate } = entry as Record<string, unknown>;
        if (typeof slug !== "string" || typeof name !== "string") return [];
        return [{
          slug,
          name,
          ...(typeof url === "string" ? { url } : {}),
          ...(typeof startDate === "string" ? { startDate } : {}),
          ...(typeof endDate === "string" ? { endDate } : {}),
        }];
      });
    } catch {
      return [];
    }
  })();
  return cataloguePromise;
}

/** Test seam: forget the cached catalogue. */
export function resetConferenceCatalogue(): void {
  cataloguePromise = null;
}

/** The catalogue entry for the address's conference, or null while it loads or when it is unknown. */
export function useConferenceEntry(slug: string | null): ConferenceInfo | null {
  const [entry, setEntry] = useState<ConferenceInfo | null>(null);
  useEffect(() => {
    if (!slug) { setEntry(null); return; }
    let active = true;
    void conferenceCatalogue().then((list) => { if (active) setEntry(list.find((c) => c.slug === slug) ?? null); });
    return () => { active = false; };
  }, [slug]);
  return entry;
}

/**
 * Whether the event is over, using the shared client rule: the current time is later than the end of
 * `endDate` everywhere on Earth, so the last minute of that calendar day in UTC−12 must have passed.
 * `now` is a parameter so tests never depend on the real clock; an entry with no usable end date
 * (or no entry yet) is never "ended", which keeps registration available when the catalogue is unknown.
 */
export function hasEnded(entry: ConferenceInfo | null, now: number = Date.now()): boolean {
  const end = entry?.endDate ? Date.parse(`${entry.endDate}T23:59:59.999-12:00`) : NaN;
  return Number.isFinite(end) && now > end;
}

/** "published" and "unpublished" are known from the catalog; "unknown" means the check failed. */
export type TalkAvailability = "published" | "unpublished" | "unknown";

/** Whether the conference has any talks at all: the topics catalog is built from its seeded talks. */
export function useTalkAvailability(conference: string | null): TalkAvailability {
  const [availability, setAvailability] = useState<TalkAvailability>("unknown");
  useEffect(() => {
    if (!conference) { setAvailability("unknown"); return; }
    let active = true;
    setAvailability("unknown");
    api.catalogTopics(conference).then(
      ({ topics }) => { if (active) setAvailability(topics.length === 0 ? "unpublished" : "published"); },
      () => { if (active) setAvailability("unknown"); },
    );
    return () => { active = false; };
  }, [conference]);
  return availability;
}

/**
 * Shown wherever a talk list is empty because the event has no programme yet: point at the
 * organiser's own page rather than leave an empty list that looks like a failed search.
 */
export function UnpublishedTalksState({ conference }: { conference: ConferenceInfo | null }) {
  const name = conference?.name ?? "this conference";
  return <p role="status" className="page-state page-state-empty">
    Talks for {name} have not been published yet.{" "}
    <a href={conference?.url ?? "/site/#conferences"}>{conference?.url ? "Open the official event site" : "Open the conference list"}</a>.
  </p>;
}

/**
 * Shown in place of the registration prompt once the event is over. The programme and the event page
 * stay reachable — only a new registration is impossible — and "Browse the talks" is offered only when
 * the event actually published talks, so the link never leads to an empty list.
 */
export function EndedConferenceState({ conference, talks, search }: {
  conference: ConferenceInfo;
  talks: TalkAvailability;
  search: string;
}) {
  return <p role="status" className="page-state page-state-empty">
    {conference.name} has ended, so registration is closed.{" "}
    {talks === "published" && <>
      <a href={withConference(`/search?c=${conference.slug}`, search)}>Browse the talks</a>.{" "}
    </>}
    <a href={`/site/conference.html?c=${conference.slug}`}>Open the event page</a>.
  </p>;
}
