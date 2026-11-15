import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSite, apiUrl, describeStatus, getLiveAggregates, getConfig, resetConfigCache, getStatus, signUp, completeSignup, storeToken, selectTalks,
  toRegisterRequest, toOnboardingAnswers, fetchAccessToken, applyAppLinks, TOKEN_KEY, DEFAULT_EXPERIENCE,
  conferenceSlug, scopedApiUrl, getConferenceTopics,
} from "../js/companion-api.js";
import { registrationUrl } from "../js/qr.js";
import { validProfile } from "./helpers.mjs";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

/** Runs fn as if the page were served under /site/ on the app's origin, with a fake fetch and sessionStorage. */
async function onSite(handler, fn, { search = "" } = {}) {
  const saved = { fetch: globalThis.fetch, location: globalThis.location, sessionStorage: globalThis.sessionStorage };
  const calls = [];
  globalThis.location = { pathname: "/site/register.html", origin: "http://app.test:5173", search };
  Object.defineProperty(globalThis, "sessionStorage", { value: memoryStorage(), configurable: true, writable: true });
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return handler(call);
  };
  resetConfigCache();
  try { return await fn(calls); } finally {
    globalThis.fetch = saved.fetch;
    globalThis.location = saved.location;
    Object.defineProperty(globalThis, "sessionStorage", { value: saved.sessionStorage, configurable: true, writable: true });
    if (saved.location === undefined) delete globalThis.location;
    resetConfigCache();
  }
}

const talks = [
  { talk: { id: "a", start: "2026-11-10T09:00:00Z", end: "2026-11-10T10:00:00Z" }, score: 1 },
  { talk: { id: "b", start: "2026-11-10T09:30:00Z", end: "2026-11-10T10:30:00Z" }, score: 3 },
  { talk: { id: "bad", start: "nope", end: "2026-11-10T10:30:00Z" }, score: 9 },
  { talk: { id: "rev", start: "2026-11-10T11:00:00Z", end: "2026-11-10T10:00:00Z" }, score: 8 },
];

function realApi(over = {}) {
  return (c) => {
    const key = `${c.method} ${c.url.split("?")[0]}`;
    if (over[key]) return over[key](c);
    switch (key) {
      case "POST /api/register": return json({ attendeeId: "att-1", token: "attendee.jwt", expiresAt: "2030-01-01T00:00:00Z" }, 201);
      case "POST /api/onboarding": return json({ query: { text: "kubernetes search", topics: ["kubernetes"], mode: "hybrid" } });
      case "GET /api/search": return json({ hits: talks });
      case "POST /api/schedule": return json({ items: [], updatedAt: "2030-01-01T00:00:00Z" });
      case "POST /api/access/token": return json({ token: "access.jwt", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      default: return new Response("{}", { status: 404 });
    }
  };
}

test("isSite / apiUrl is always the absolute same-origin /api/...", () => {
  assert.equal(isSite("/site/register.html"), true);
  assert.equal(isSite("/site"), true);
  assert.equal(isSite("/register.html"), false);
  assert.equal(isSite("/sitemap.html"), false);
  assert.equal(apiUrl("chat"), "/api/chat");
  assert.equal(apiUrl("events"), "/api/events");
});

test("on the site, config is derived in the browser (no /api/config), appBase is the origin root", async () => {
  await onSite(realApi(), async (calls) => {
    assert.deepEqual(await getConfig(), { events: true, appBase: "", apiBase: "", publicUrl: "http://app.test:5173", chat: "auto" });
    assert.equal(calls.length, 0);
    assert.equal(apiUrl("status"), "/api/status");
    {
      const a = { dataset: { appLink: "/schedule" }, href: "" };
      await applyAppLinks({ querySelectorAll: () => [a] });
      assert.equal(a.href, "/schedule");
    }
  });
});

test("applyAppLinks: the page's ?c= travels with every app link, keeping its own query and hash", async () => {
  await onSite(realApi(), async () => {
    const plain = { dataset: { appLink: "/schedule" }, href: "" };
    const withQuery = { dataset: { appLink: "/search?mode=hybrid#top" }, href: "" };
    const carried = { dataset: { appLink: "/search?c=old-slug" }, href: "" };
    await applyAppLinks({ querySelectorAll: () => [plain, withQuery, carried] });
    assert.equal(plain.href, "/schedule?c=pycon-us-2027");
    assert.equal(withQuery.href, "/search?mode=hybrid&c=pycon-us-2027#top");
    assert.equal(carried.href, "/search?c=pycon-us-2027", "the page's own slug wins over a stale one on the attribute");
  }, { search: "?c=pycon-us-2027" });
  // a malformed ?c= is not copied onto a link (the API's slug shape, shared/src/contract.ts)
  await onSite(realApi(), async () => {
    const a = { dataset: { appLink: "/schedule" }, href: "" };
    await applyAppLinks({ querySelectorAll: () => [a] });
    assert.equal(a.href, "/schedule");
  }, { search: "?c=not%20a%20slug" });
});

test("getStatus reads the real /api/status on the site", async () => {
  await onSite((c) => (c.url === "/api/status" ? json({ status: "ok" }) : new Response("", { status: 404 })), async () => {
    assert.equal((await getStatus()).status, "ok");
  });
});

test("registration URL on the site is origin + /site/register.html?c=..&via=qr", () => {
  assert.equal(registrationUrl({ origin: "http://app.test:5173", slug: "c-1", pagePath: "/site/register.html" }), "http://app.test:5173/site/register.html?c=c-1&via=qr");
});

test("toRegisterRequest: the real contract, both consents true, no email", () => {
  const body = toRegisterRequest(validProfile(), { slug: "cn-2026" });
  assert.deepEqual(body, { name: "Ada", email: "", interests: validProfile().interests, consent: { clusterMap: true, qrCheckin: true }, conference: "cn-2026" });
  assert.deepEqual(Object.keys(body).sort(), ["conference", "consent", "email", "interests", "name"]);
});

test("toOnboardingAnswers maps the chat answers onto OnboardingAnswers", () => {
  const a = toOnboardingAnswers({ ...validProfile(), goal: "learn", formats: "workshops", role: "engineer" });
  assert.deepEqual(a, { topics: validProfile().interests, experience: DEFAULT_EXPERIENCE, goals: ["learn"], freeText: "engineer; formats: workshops" });
  assert.deepEqual(toOnboardingAnswers({ ...validProfile(), goal: "", formats: "" }).goals, []);
  assert.ok(["beginner", "intermediate", "advanced"].includes(a.experience));
});

test("selectTalks matches the Onboarding page: best score first, invalid times dropped, overlaps kept", () => {
  assert.deepEqual(selectTalks(talks), ["b", "a"]);
});

test("signUp: register -> app token in sessionStorage 'cc.token' -> onboarding -> search -> schedule -> check-in token for the QR", async () => {
  await onSite(realApi(), async (calls) => {
    const t = await signUp({ slug: "cn-2026", name: "CN" }, validProfile(), { returning: true });
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url.split("?")[0]}`), [
      "POST /api/register", "POST /api/onboarding", "GET /api/search", "POST /api/schedule", "POST /api/access/token",
    ]);
    assert.equal(sessionStorage.getItem(TOKEN_KEY), "attendee.jwt");
    assert.equal(calls[0].body.returning, true);
    assert.deepEqual(calls[0].body.consent, { clusterMap: true, qrCheckin: true });
    assert.equal(calls[0].headers.authorization, undefined); // register is unauthenticated
    for (const c of calls.slice(1)) assert.equal(c.headers.authorization, "Bearer attendee.jwt");
    // both catalogue routes carry the conference; a save by talk id is a by-id lookup and does not
    assert.equal(calls[1].url, "/api/onboarding?conference=cn-2026");
    assert.equal(calls[2].url, "/api/search?q=kubernetes+search&mode=hybrid&conference=cn-2026");
    assert.deepEqual(calls[3].body, { talkIds: ["b", "a"] });
    assert.equal(t.source, "api");
    assert.equal(t.token, "access.jwt", "the QR encodes the check-in token, not the session token");
    assert.equal(t.expiresAt, "2030-01-01T00:00:00Z");
    assert.equal(t.scheduleSaved, true);
  }, { search: "?c=cn-2026" });
});

test("signUp: without ?c= the scoped catalogue routes are not called at all", async () => {
  await onSite(realApi(), async (calls) => {
    const t = await signUp({ slug: "cn-2026" }, validProfile());
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url.split("?")[0]}`), ["POST /api/register", "POST /api/access/token"]);
    assert.equal(t.source, "api");
    assert.equal(t.scheduleSaved, false);
  });
});

test("signUp: sends the temporary identity claim and treats a rejected claim as sign-in required, not a demo ticket", async () => {
  await onSite(realApi({ "POST /api/register": () => json({ error: "already_registered" }, 409) }), async (calls) => {
    const claim = { token: "claim.jwt", expiresAt: "2030-01-01T00:00:00Z" };
    sessionStorage.setItem("cc.identity-claim", JSON.stringify(claim));
    const result = await signUp({ slug: "cn-2026" }, validProfile());
    assert.equal(calls[0].body.identityClaim, "claim.jwt");
    assert.deepEqual(result, { source: "error", error: "already_registered" });
    assert.equal(sessionStorage.getItem("cc.identity-claim"), null);
    assert.equal(sessionStorage.getItem(TOKEN_KEY), null);
  });
});

test("signUp: an expired or invalid claim and a validation failure are reported, not dressed up as a demo ticket", async () => {
  await onSite(realApi({ "POST /api/register": () => json({ error: "invalid_identity_claim" }, 400) }), async () => {
    sessionStorage.setItem("cc.identity-claim", JSON.stringify({ token: "stale.jwt", expiresAt: "2030-01-01T00:00:00Z" }));
    assert.deepEqual(await signUp({ slug: "cn-2026" }, validProfile()), { source: "error", error: "identity_claim_invalid" });
    assert.equal(sessionStorage.getItem("cc.identity-claim"), null);
    assert.equal(sessionStorage.getItem(TOKEN_KEY), null);
  });
  await onSite(realApi({ "POST /api/register": () => json({ error: "invalid_request" }, 400) }), async () => {
    const result = await signUp({ slug: "cn-2026" }, validProfile());
    assert.deepEqual(result, { source: "error", error: "registration_failed" });
    assert.equal(sessionStorage.getItem(TOKEN_KEY), null);
  });
});

test("signUp: a conference with no published talks is reported as schedule_not_published, not a sign-in problem", async () => {
  await onSite(realApi({ "POST /api/register": () => json({ error: "schedule_not_published" }, 409) }), async (calls) => {
    const result = await signUp({ slug: "cn-2026" }, validProfile());
    assert.deepEqual(result, { source: "error", error: "schedule_not_published" });
    assert.equal(calls[0].body.conference, "cn-2026", "the register body names the conference");
    assert.equal(sessionStorage.getItem(TOKEN_KEY), null);
  });
});

test("toRegisterRequest: the page's ?c= supplies the conference when the caller passes none", async () => {
  await onSite(realApi(), async () => {
    assert.equal(toRegisterRequest(validProfile()).conference, "cn-2026");
    assert.equal(toRegisterRequest(validProfile(), { name: "no slug" }).conference, "cn-2026");
  }, { search: "?c=cn-2026" });
  assert.equal("conference" in toRegisterRequest(validProfile()), false, "no event chosen: nothing is invented");
});

test("signUp: storeToken resets the offline session when the token changes, like the React app", async () => {
  await onSite(realApi(), async () => {
    sessionStorage.setItem("cc.offline-session", "old");
    storeToken("t1");
    assert.equal(sessionStorage.getItem("cc.offline-session"), null);
    sessionStorage.setItem("cc.offline-session", "keep");
    storeToken("t1");
    assert.equal(sessionStorage.getItem("cc.offline-session"), "keep");
  });
});

test("signUp: a failing schedule or check-in token still leaves a registered ticket", async () => {
  await onSite(realApi({ "POST /api/onboarding": () => new Response("{}", { status: 500 }), "POST /api/access/token": () => new Response("{}", { status: 401 }) }), async () => {
    const t = await signUp({ slug: "c" }, validProfile());
    assert.equal(t.source, "api");
    assert.equal(t.token, null);
    assert.equal(t.scheduleSaved, false);
    assert.equal(sessionStorage.getItem(TOKEN_KEY), "attendee.jwt");
  }, { search: "?c=c" });
});

test("signUp: when registration fails the ticket is a local Demo ticket and no app token is stored", async () => {
  for (const handler of [realApi({ "POST /api/register": () => new Response("{}", { status: 503 }) }), () => { throw new TypeError("network"); }, realApi({ "POST /api/register": () => json({ nope: 1 }, 201) })]) {
    await onSite(handler, async () => {
      const t = await completeSignup({ slug: "c" }, validProfile());
      assert.equal(t.source, "local");
      assert.match(t.token, /^demo\./);
      assert.equal(sessionStorage.getItem(TOKEN_KEY), null);
    });
  }
});

test("fetchAccessToken validates the response", async () => {
  await onSite(realApi({ "POST /api/access/token": () => json({ token: "x", expiresAt: "garbage" }) }), async () => {
    await assert.rejects(fetchAccessToken("t"));
  });
});

test("getLiveAggregates: demo-aggregates shape from the real aggregate route, null when unavailable", async () => {
  const agg = { topics: [{ topic: "kubernetes", count: 12 }, { topic: "other", count: 6 }], totalOptedIn: 30, suppressedBelow: 5, generatedAt: "x" };
  await onSite((c) => (c.url === "/api/interests/aggregate" ? json(agg) : c.url.startsWith("/api/rooms/occupancy") ? json({ rooms: [{ room: "Hall A", level: "quiet" }] }) : new Response("", { status: 404 })), async (calls) => {
    const live = await getLiveAggregates();
    assert.equal(live.attendeeCount, 30);
    assert.deepEqual(live.topicCounts, [{ tag: "kubernetes", count: 12 }, { tag: "other", count: 6 }]);
    assert.deepEqual(live.clusters[0], { id: "kubernetes", label: "kubernetes", count: 12, topTags: ["kubernetes"] });
    assert.equal(live.clusters[1].id, "other");
    assert.deepEqual(live.roomLevels, [{ room: "Hall A", level: "quiet" }]);
    assert.deepEqual(live.roomOccupancy, []);
    assert.deepEqual(calls.map((c) => c.url), ["/api/interests/aggregate", "/api/rooms/occupancy?conference=cn-2026"]);
    const demo = JSON.parse((await import("node:fs")).readFileSync(new URL("../data/demo-aggregates.json", import.meta.url), "utf8"));
    for (const k of ["attendeeCount", "clusters", "topicCounts", "roomOccupancy", "suppressedGroups"]) assert.ok(k in live && k in demo, k);
  }, { search: "?c=cn-2026" });
  // no ?c=: the scoped occupancy route is not called, so the overlay has no room levels rather than a guess
  await onSite((c) => (c.url === "/api/interests/aggregate" ? json(agg) : new Response("", { status: 404 })), async (calls) => {
    const live = await getLiveAggregates();
    assert.equal(live.attendeeCount, 30);
    assert.deepEqual(live.roomLevels, []);
    assert.deepEqual(calls.map((c) => c.url), ["/api/interests/aggregate"]);
  });
  await onSite(() => json({ topics: [], totalOptedIn: 0 }), async () => assert.equal(await getLiveAggregates(), null));
  await onSite(() => { throw new Error("down"); }, async () => assert.equal(await getLiveAggregates(), null));
  assert.equal(await getLiveAggregates(), null); // not on the site
});

test("conference scoped URLs: the page slug, or null when the visitor has not chosen a conference", () => {
  assert.equal(conferenceSlug("?c=kubecon-na-2026"), "kubecon-na-2026");
  assert.equal(conferenceSlug("?c=%20pycon-us-2027%20"), "pycon-us-2027");
  assert.equal(conferenceSlug("?via=qr"), "");
  assert.equal(conferenceSlug(""), "");
  assert.equal(scopedApiUrl("search", "pycon-us-2027"), "/api/search?conference=pycon-us-2027");
  assert.equal(scopedApiUrl("rooms/occupancy", "a b"), "/api/rooms/occupancy?conference=a%20b");
  assert.equal(scopedApiUrl("search", ""), null);
});

test("getConferenceTopics: sends conference, empty topics means none published, null when the route cannot answer", async () => {
  await onSite((c) => (c.url === "/api/catalog/topics?conference=pycon-us-2027" ? json({ topics: ["python", "  ", 7, "open source"] }) : new Response("", { status: 404 })), async (calls) => {
    assert.deepEqual(await getConferenceTopics("pycon-us-2027"), { topics: ["python", "open source"] });
    assert.deepEqual(calls.map((c) => c.url), ["/api/catalog/topics?conference=pycon-us-2027"]);
  });
  await onSite(() => json({ topics: [] }), async () => assert.deepEqual(await getConferenceTopics("pycon-us-2027"), { topics: [] }));
  await onSite(() => new Response("", { status: 404 }), async () => assert.equal(await getConferenceTopics("pycon-us-2027"), null));
  await onSite(() => json({ nope: 1 }), async () => assert.equal(await getConferenceTopics("pycon-us-2027"), null));
  await onSite(() => { throw new TypeError("network"); }, async () => assert.equal(await getConferenceTopics("pycon-us-2027"), null));
  await onSite(() => json({ topics: ["x"] }), async (calls) => {
    assert.equal(await getConferenceTopics(), null, "no ?c=: not called");
    assert.equal(calls.length, 0);
  });
});

test("describeStatus understands the real StatusResponse (no `ok` field) and getStatus passes it through", async () => {
  const real = { status: "degraded", generatedAt: "2026-11-10T09:00:00Z", windowSeconds: 300, api: { up: true, version: "0.1.0" },
    database: { reachable: true }, search: { keyword: { samples: 3, p95Ms: 40 }, hybrid: { samples: 0, p95Ms: null, state: "warming_up" } },
    errorRate: { requests: 10, serverErrors: 0, ratio: 0 } };
  await onSite(() => json(real), async () => {
    const st = await getStatus();
    assert.equal(describeStatus(st).label, "Search is warming up, try keyword");
    assert.equal(describeStatus({ ...real, status: "ok" }).tone, "ok");
  });
});
