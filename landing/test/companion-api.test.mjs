import { test } from "node:test";
import assert from "node:assert/strict";
import { describeStatus, getConfig, resetConfigCache, getStatus, register, localTicket, sendChat, applyAppLinks, renderStatusBadges, signUp, STATUS_POLL_MS } from "../js/companion-api.js";
import { validProfile } from "./helpers.mjs";

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers });
async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  resetConfigCache();
  try { return await fn(); } finally { globalThis.fetch = real; resetConfigCache(); }
}

test("describeStatus mirrors web/src/components/status.ts", () => {
  const base = { ok: true, generatedAt: "", windowSeconds: 300, api: { up: true, version: "1" } };
  assert.deepEqual(describeStatus({ ...base, status: "ok" }), { tone: "ok", symbol: "✓", label: "All systems normal" });
  assert.deepEqual(describeStatus({ ...base, status: "down" }), { tone: "down", symbol: "✕", label: "Search is unavailable, retrying" });
  assert.equal(describeStatus({ ...base, status: "degraded", search: { hybrid: { state: "warming_up" } } }).label, "Search is warming up, try keyword");
  assert.equal(describeStatus({ ...base, status: "degraded", search: { hybrid: { state: "ready" } } }).label, "Some requests are failing, we are looking into it");
  assert.equal(describeStatus({ ...base, status: "degraded" }).tone, "degraded");
  for (const bad of [null, undefined, { ok: false, reason: "unreachable" }, { ok: true, status: "weird" }, {}]) {
    assert.deepEqual(describeStatus(bad), { tone: "unknown", symbol: "?", label: "Status unavailable" });
  }
  assert.equal(STATUS_POLL_MS, 30_000);
});

test("getConfig: uses /api/config, caches, and falls back statically", async () => {
  let calls = 0;
  await withFetch(async (url) => { calls++; assert.match(String(url), /\/api\/config$/); return json({ appBase: "http://app:1", apiBase: "http://api:2", publicUrl: "http://pub:3", chat: "claude", events: false }); }, async () => {
    assert.deepEqual(await getConfig(), { appBase: "http://app:1", apiBase: "http://api:2", publicUrl: "http://pub:3", chat: "claude", events: false });
    await getConfig();
    assert.equal(calls, 1);
  });
  for (const impl of [async () => { throw new Error("down"); }, async () => new Response("x", { status: 404 }), async () => json({ appBase: "javascript:alert(1)" }), async () => new Response("<html>", { status: 200 })]) {
    await withFetch(impl, async () => {
      const c = await getConfig();
      assert.equal(c.appBase, "http://localhost:5173");
      assert.equal(c.chat, "scripted");
    });
  }
});

test("getStatus never throws", async () => {
  await withFetch(async () => json({ ok: true, status: "ok" }), async () => assert.equal((await getStatus()).status, "ok"));
  for (const impl of [async () => { throw new Error("x"); }, async () => new Response("", { status: 404 }), async () => new Response("<html>")]) {
    await withFetch(impl, async () => assert.deepEqual(await getStatus(), { ok: false, reason: "unreachable" }));
  }
});

test("register: passes through api/local tickets from the server, otherwise generates a local one", async () => {
  const t = { source: "api", attendeeId: "a", token: "t", expiresAt: "2030-01-01T00:00:00Z" };
  await withFetch(async (url, init) => {
    assert.match(String(url), /\/api\/register$/);
    const body = JSON.parse(init.body);
    assert.equal(body.conference.slug, "x");
    assert.equal(body.profile.name, "Ada");
    return json(t);
  }, async () => assert.deepEqual(await register({ slug: "x", name: "X" }, validProfile()), t));
  for (const impl of [async () => { throw new Error("x"); }, async () => new Response("", { status: 404 }), async () => json({ source: "api", attendeeId: 5 }), async () => json({ source: "other", attendeeId: "a", token: "t", expiresAt: "e" })]) {
    await withFetch(impl, async () => {
      const r = await register({ slug: "x", name: "X" }, validProfile());
      assert.equal(r.source, "local");
      assert.match(r.token, /^demo\.[A-Za-z0-9_-]+$/);
    });
  }
  const a = localTicket(0), b = localTicket(0);
  assert.notEqual(a.token, b.token);
  assert.match(a.attendeeId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(a.expiresAt, "1970-01-02T00:00:00.000Z");
});

test("signUp: a 409 event_ended keeps its own code; any other 409 is still a sign-in problem", async () => {
  const cases = [
    [{ error: "event_ended" }, "event_ended"],
    [{ error: "schedule_not_published" }, "schedule_not_published"],
    [{ error: "already_registered" }, "already_registered"],
    [{}, "already_registered"], // a 409 with no code: the old reading, unchanged
  ];
  for (const [body, expected] of cases) {
    await withFetch(async () => json(body, 409), async () => {
      const r = await signUp({ slug: "kubecon-na-2026", name: "KubeCon" }, validProfile());
      assert.equal(r.source, "error");
      assert.equal(r.error, expected, JSON.stringify(body));
    });
  }
});

test("sendChat: validates the response, retries a 429 once, rejects when the endpoint is missing", async () => {
  const ctx = { conference: { slug: "x", name: "X" }, via: null, messages: [] };
  await withFetch(async (url, init) => {
    assert.match(String(url), /\/api\/chat$/);
    assert.equal(JSON.parse(init.body).via, null);
    return json({ reply: "Hi", done: false, mode: "claude" });
  }, async () => assert.deepEqual(await sendChat(ctx), { reply: "Hi", done: false, mode: "claude", ask: null }));

  await withFetch(async () => json({ reply: "Done", done: true, mode: "scripted", profile: { ...validProfile(), extra: 1 } }), async () => {
    const r = await sendChat(ctx);
    assert.equal(r.done, true);
    assert.equal("extra" in r.profile, false);
  });
  await withFetch(async () => json({ reply: "Done", done: true, profile: { name: 5 } }), async () => assert.rejects(sendChat(ctx)));
  await withFetch(async () => json({ nope: 1 }), async () => assert.rejects(sendChat(ctx)));
  await withFetch(async () => new Response("", { status: 404 }), async () => assert.rejects(sendChat(ctx)));
  await withFetch(async () => new Response("", { status: 501 }), async () => assert.rejects(sendChat(ctx)));

  let n = 0;
  await withFetch(async () => (n++ === 0 ? json({ error: "busy" }, 429, { "retry-after": "1" }) : json({ reply: "ok", done: false })), async () => {
    assert.equal((await sendChat(ctx)).reply, "ok");
    assert.equal(n, 2);
  });
});

test("applyAppLinks and renderStatusBadges touch only data-app-link / data-status-badge elements", async () => {
  const mkLink = (v) => ({ dataset: { appLink: v }, href: "#" });
  const links = [mkLink("/schedule"), mkLink("onboarding"), mkLink("")];
  const badge = { dataset: {}, textContent: "" };
  const root = { querySelectorAll: (sel) => (sel === "a[data-app-link]" ? links : sel === "[data-status-badge]" ? [badge] : []) };
  await withFetch(async () => json({ appBase: "http://app.test:5173/", apiBase: "http://a", publicUrl: "http://p", chat: "scripted" }), async () => {
    await applyAppLinks(root);
    assert.deepEqual(links.map((l) => l.href), ["http://app.test:5173/schedule", "http://app.test:5173/onboarding", "http://app.test:5173/"]);
  });
  renderStatusBadges({ ok: true, status: "ok" }, root);
  assert.equal(badge.dataset.status, "ok");
  assert.equal(badge.textContent, "All systems normal");
  renderStatusBadges({ ok: false, reason: "unreachable" }, root);
  assert.equal(badge.dataset.status, "unknown");
  assert.equal(badge.textContent, "Status unavailable");
});
