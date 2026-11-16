import { isConferenceSlug, routes, type RouteDef } from "@cc/shared";
import { offlineExpiry, offlineSession, resetOfflineSession } from "./offline.js";
import type {
  AuthProviderId,
  AccessTokenResponse,
  AuthCallbackResponse,
  AuthProvidersResponse,
  RoomOccupancyResponse,
  RoomPlacementResponse,
  CatalogTopicsResponse,
  InterestAggregateResponse,
  InterestClustersResponse,
  OnboardingRequest,
  OnboardingResponse,
  RegisterRequest,
  RegisterResponse,
  SaveScheduleRequest,
  ScanRequest,
  ScanResponse,
  ScheduleResponse,
  SearchMode,
  SearchFilterParams,
  SearchResponse,
  StatusResponse,
} from "@cc/shared";
import { searchFilterQuery } from "./searchFilters.js";

const TOKEN_KEY = "cc.token";
const EXPIRES_KEY = "cc.token.expiresAt";
/** The provider a session came from ("github" after a GitHub sign-in); absent for a chat registration. */
const VIA_KEY = "cc.token.via";
let memoryToken: string | null = null;

/**
 * The attendee token. It lives in localStorage, so every tab of this browser shares it until the server's expiry
 * (8 hours). A stored token past its expiry is dropped here, so the page asks for a sign-in instead of failing later.
 */
export function getToken(): string | null {
  try {
    const expiresAt = localStorage.getItem(EXPIRES_KEY);
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      memoryToken = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRES_KEY);
      localStorage.removeItem(VIA_KEY);
      return null;
    }
    return memoryToken ?? localStorage.getItem(TOKEN_KEY);
  } catch {
    return memoryToken;
  }
}

/** The provider of the live session, or null: a chat registration has none. */
export function sessionVia(): string | null {
  if (getToken() === null) return null;
  try {
    return localStorage.getItem(VIA_KEY);
  } catch {
    return null;
  }
}

/** Records (or clears, with null) the provider the live session came from. */
export function setSessionVia(provider: string | null): void {
  try {
    if (provider) localStorage.setItem(VIA_KEY, provider);
    else localStorage.removeItem(VIA_KEY);
  } catch {
    // storage unavailable: the session simply shows no provider
  }
}

/** The sign-in claim a new GitHub account left in this tab (15 minutes), or null when none is pending or it has expired. */
export function pendingClaim(): { token: string; expiresAt: string } | null {
  try {
    const claim = JSON.parse(sessionStorage.getItem("cc.identity-claim") ?? "null") as { token?: unknown; expiresAt?: unknown } | null;
    return claim && typeof claim.token === "string" && typeof claim.expiresAt === "string" && Date.parse(claim.expiresAt) > Date.now()
      ? { token: claim.token, expiresAt: claim.expiresAt }
      : null;
  } catch {
    return null;
  }
}

export function setToken(token: string, expiresAt?: string, via: string | null = null): void {
  if (token !== getToken()) resetOfflineSession();
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) localStorage.setItem(EXPIRES_KEY, expiresAt);
    else localStorage.removeItem(EXPIRES_KEY);
    setSessionVia(via);
  } catch {
    // storage unavailable; token only lives for this page view
  }
}

/**
 * Signs this browser out. The token goes from every tab; the linked display profile stays in localStorage, and the
 * visitor's saved data is untouched.
 */
export function signOut(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    localStorage.removeItem(VIA_KEY);
  } catch {
    // storage unavailable; the in-memory token is already gone
  }
  resetOfflineSession(); // removes cc.offline-session and tells the worker to forget the saved schedule
}

const LINKED_KEY = "cc.linked.v1";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** The `?c=` conference slug of the current address, or null when the page was opened without one. */
export function conferenceFromLocation(): string | null {
  const slug = new URLSearchParams(window.location.search).get("c");
  return isConferenceSlug(slug) ? slug : null;
}

/**
 * The required `conference` query for a catalogue route. The API has no default
 * event, so a scoped call without a slug is a bug rather than a different result.
 */
function scopedQuery(conference: string | null): Record<string, string> {
  if (!conference) throw new ApiError("conference_required", 400, "conference_required");
  if (!isConferenceSlug(conference)) throw new ApiError("invalid_request", 400, "invalid_request");
  return { conference };
}

async function call<T>(
  route: RouteDef,
  opts: { body?: unknown; query?: Record<string, string | string[]>; headers?: Record<string, string> } = {},
): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) for (const item of Array.isArray(v) ? v : [v]) params.append(k, item);
  const qs = opts.query ? `?${params.toString()}` : "";
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${route.path}${qs}`, {
    method: route.method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    let code: string | undefined;
    try {
      const body = await res.json() as { error?: unknown };
      if (typeof body.error === "string") code = body.error;
    } catch { /* non-JSON error response */ }
    throw new ApiError(`${route.method} ${route.path} failed: ${res.status}`, res.status, code);
  }
  return (await res.json()) as T;
}

/**
 * The scan endpoint answers an expired or invalid token with 401 and a deny
 * body ({decision, room, reason}); that is a result to show, not a failure.
 * The kiosk is not an attendee, so no session token is sent.
 */
async function scanRoom(body: ScanRequest): Promise<ScanResponse> {
  const res = await fetch(routes.accessScan.path, {
    method: routes.accessScan.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok || res.status === 401) {
    const data = (await res.json()) as Partial<ScanResponse>;
    if (data.decision === "allow" || data.decision === "deny") return data as ScanResponse;
  }
  throw new Error(`${routes.accessScan.method} ${routes.accessScan.path} failed: ${res.status}`);
}

/** Finishes OAuth: receives display fields plus either a session or a one-time identity claim. */
async function authCallback(provider: string, body: { code: string; state: string }): Promise<AuthCallbackResponse> {
  const path = routes.authCallback.path.replace(":provider", encodeURIComponent(provider));
  const res = await fetch(path, {
    method: routes.authCallback.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(`${routes.authCallback.method} ${routes.authCallback.path} failed: ${res.status}`, res.status);
  return (await res.json()) as AuthCallbackResponse;
}

export const api = {
  authCallback,
  authProviders: async (): Promise<AuthProvidersResponse> => {
    const res = await fetch("/api/auth/providers", { headers: { accept: "application/json" } });
    if (!res.ok) throw new ApiError(`GET /api/auth/providers failed: ${res.status}`, res.status);
    return (await res.json()) as AuthProvidersResponse;
  },
  roomOccupancy: async (conference: string | null) =>
    call<RoomOccupancyResponse>(routes.roomOccupancy, { query: scopedQuery(conference) }),
  catalogTopics: async (conference: string | null) =>
    call<CatalogTopicsResponse>(routes.catalogTopics, { query: scopedQuery(conference) }),
  status: () => call<StatusResponse>(routes.status),
  register: (body: RegisterRequest) => call<RegisterResponse>(routes.register, { body }),
  /** Attaches a new account's sign-in claim to the signed-in attendee (204). A 409 means the account already has a profile. */
  linkIdentity: async (identityClaim: string): Promise<void> => {
    const token = getToken();
    const res = await fetch(routes.linkIdentity.path, {
      method: routes.linkIdentity.method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ identityClaim }),
    });
    if (!res.ok) throw new ApiError(`${routes.linkIdentity.path} failed: ${res.status}`, res.status);
  },
  onboarding: async (body: OnboardingRequest, conference: string | null) =>
    call<OnboardingResponse>(routes.onboarding, { body, query: scopedQuery(conference) }),
  search: async (q: string, mode: SearchMode, debug = false, filters: SearchFilterParams = {}, conference: string | null = null) =>
    call<SearchResponse & { debug?: unknown }>(routes.search, {
      query: { q, mode, ...(debug ? { debug: "1" } : {}), ...searchFilterQuery(filters), ...scopedQuery(conference) },
    }),
  getSchedule: async (): Promise<ScheduleResponse & { offlineSavedAt?: string }> => {
    const token = getToken();
    const session = token ? offlineSession() : null;
    const res = await fetch(routes.getSchedule.path, {
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(session ? { "x-cc-offline-session": session, "x-cc-offline-until": String(offlineExpiry(token!)) } : {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new ApiError(`GET ${routes.getSchedule.path} failed: ${res.status}`, res.status);
    const data = await res.json() as ScheduleResponse;
    const saved = res.headers.get("x-cc-offline-saved-at");
    return saved ? { ...data, offlineSavedAt: saved } : data;
  },
  calendar: async (talkId?: string): Promise<Blob> => {
    const token = getToken();
    const query = talkId === undefined ? "" : `?${new URLSearchParams({ talkId })}`;
    const res = await fetch(`${routes.exportCalendar.path}${query}`, {
      headers: { accept: "text/calendar", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new ApiError(`Calendar export failed: ${res.status}`, res.status);
    return res.blob();
  },
  saveSchedule: async (body: SaveScheduleRequest, conference: string | null = null) =>
    call<ScheduleResponse>(routes.saveSchedule, { body, query: body.answers ? scopedQuery(conference) : undefined }),
  accessToken: () => call<AccessTokenResponse>(routes.accessToken, { body: {} }),
  scan: scanRoom,
  aggregate: () => call<InterestAggregateResponse>(routes.interestsAggregate),
  /** Latest k-means run for organizers; `organizerKey` is sent as x-organizer-key when set. */
  clusters: (organizerKey = "") =>
    call<InterestClustersResponse>(routes.interestsClusters, { headers: organizerKey ? { "x-organizer-key": organizerKey } : {} }),
  /** Room placement suggestions for organizers; `organizerKey` is sent as x-organizer-key when set. */
  roomPlacement: async (organizerKey = "", conference: string | null = null) =>
    call<RoomPlacementResponse>(routes.roomPlacement, {
      query: scopedQuery(conference),
      headers: organizerKey ? { "x-organizer-key": organizerKey } : {},
    }),
};

let providersPromise: Promise<AuthProviderId[]> | null = null;

/** The sign-in providers the API has configured, fetched once per page load; `[]` when the call fails. */
export function enabledProviders(): Promise<AuthProviderId[]> {
  providersPromise ??= api
    .authProviders()
    .then((r) => r.providers.filter((p) => p.enabled).map((p) => p.id))
    .catch(() => []);
  return providersPromise;
}

/** Test seam: forget the cached provider list. */
export function resetProvidersCache(): void {
  providersPromise = null;
}

/** Where a sign-in link points: the API starts the OAuth redirect and brings the visitor back to `returnPath`. */
export function signInHref(provider: AuthProviderId, returnPath: string): string {
  return `/api/auth/${provider}/start?return=${encodeURIComponent(returnPath)}`;
}
