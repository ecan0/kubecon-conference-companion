import { test } from "node:test";
import assert from "node:assert/strict";

/** The slice of the DOM js/chat.js touches before it decides whether a conversation can start. */
class El {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  remove() { this.removed = true; }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function chatSection({ withGate = true } = {}) {
  const log = new El("ol");
  const form = new El("form");
  const input = new El("input");
  const gate = withGate ? new El("p") : null;
  const section = new El("section");
  section.querySelector = (sel) => {
    if (sel === "[data-chat-log]") return log;
    if (sel === "[data-chat-form]") return form;
    if (sel === "[data-chat-input]") return input;
    if (sel === "[data-chat-gate]") return gate;
    return null; // no ticket, no choices
  };
  return { section, log, form, input, gate };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/**
 * Runs js/chat.js as if the page had `search` in its address: the catalogue file misses, so the inlined copy
 * answers, and the scoped topics route reports `topics` (none by default). `now` fixes the clock, so a test never
 * depends on the day it runs.
 */
async function withPage(search, fn, { topics = [], now = null } = {}) {
  const saved = { document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch, now: Date.now };
  const verb = new El("span"); // the register page's "Chat sign-up for"
  const doc = {
    readyState: "complete",
    querySelectorAll: () => [],
    querySelector: (sel) => (sel === "[data-reg-verb]" ? verb : null),
    createElement: (tag) => new El(tag),
  };
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  globalThis.location = { pathname: "/site/register.html", origin: "http://app.test:5173", search };
  globalThis.fetch = async (url) => (String(url).startsWith("/api/catalog/topics") ? json({ topics }) : new Response("", { status: 404 }));
  if (now !== null) Date.now = () => now;
  try {
    const { bindChat } = await import("../js/chat.js");
    return await fn(bindChat, verb);
  } finally {
    globalThis.fetch = saved.fetch;
    Date.now = saved.now;
    Object.defineProperty(globalThis, "document", { value: saved.document, configurable: true, writable: true });
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
}

test("chat: a conference with no published talks shows the notice and never starts the conversation", async () => {
  const page = chatSection();
  await withPage("?c=pycon-us-2027", async (bindChat) => { await bindChat(page.section); });
  assert.equal(page.log.children.length, 0, "no chat message: the host never opens the conversation");
  assert.equal(page.form.hidden, true, "the form is disabled");
  assert.equal(page.section.dataset.state, "done");
  assert.equal(page.section.dataset.mode, "none");
  assert.equal(page.section.dataset.gate, "not-published");
  assert.equal(page.gate.hidden, false);
  const [notice] = page.gate.children;
  assert.equal(notice.getAttribute("role"), "status");
  const [text, space, link] = notice.children;
  assert.equal(text, "Registration opens when PyCon US publishes its talks.");
  assert.equal(space, " ");
  assert.equal(link.textContent, "Open the official event site");
  assert.equal(link.href, "https://us.pycon.org/2027/");
});

test("chat: without the register page's gate element the same notice goes into the log", async () => {
  const page = chatSection({ withGate: false });
  await withPage("?c=pycon-us-2027", async (bindChat) => { await bindChat(page.section); });
  assert.equal(page.log.children.length, 1);
  const li = page.log.children[0];
  assert.equal(li.dataset.role, "assistant");
  assert.equal(li.children.length, 1);
  const [text, space, link] = li.children[0].children;
  assert.equal(text, "Registration opens when PyCon US publishes its talks.");
  assert.equal(space, " ");
  assert.equal(link.href, "https://us.pycon.org/2027/");
  assert.ok(["Open the official event site", "Open the conference list"].includes(link.textContent));
});

test("chat: an ended conference shows the ended notice, drops the heading verb and never starts the conversation", async () => {
  const page = chatSection();
  await withPage("?c=kubecon-na-2026", async (bindChat) => { await bindChat(page.section); },
    { topics: ["kubernetes", "observability"], now: Date.parse("2026-11-15T12:00:00Z") });
  assert.equal(page.log.children.length, 0, "no chat message: the host never opens the conversation");
  assert.equal(page.form.hidden, true, "the form is disabled");
  assert.equal(page.section.dataset.state, "done");
  assert.equal(page.section.dataset.mode, "none");
  assert.equal(page.section.dataset.gate, "ended");
  const [notice] = page.gate.children;
  assert.equal(notice.getAttribute("role"), "status");
  const [text, space, browse, gap, event] = notice.children;
  assert.equal(text, "KubeCon + CloudNativeCon North America 2026 has ended, so registration is closed.");
  assert.equal(space, " ");
  assert.equal(browse.textContent, "Browse the talks");
  assert.equal(browse.href, "/search?c=kubecon-na-2026");
  assert.equal(gap, " ");
  assert.equal(event.textContent, "Open the event page");
  assert.equal(event.href, "conference.html?c=kubecon-na-2026");
});

test("chat: an ended conference with no talks, and no gate on the page, still gets the ended notice", async () => {
  const page = chatSection({ withGate: false });
  await withPage("?c=cloud-native-hackathon-slc-2026", async (bindChat) => { await bindChat(page.section); },
    { now: Date.parse("2026-11-15T12:00:00Z") });
  assert.equal(page.section.dataset.state, "done");
  assert.equal(page.section.dataset.gate, "ended", "ended wins over not-published: an event can be both");
  assert.equal(page.log.children.length, 1);
  const li = page.log.children[0];
  assert.equal(li.dataset.role, "assistant");
  const [text, space, event] = li.children[0].children;
  assert.equal(text, "Cloud Native Hackathon has ended, so registration is closed.");
  assert.equal(space, " ");
  assert.equal(event.textContent, "Open the event page");
  assert.equal(event.href, "conference.html?c=cloud-native-hackathon-slc-2026");
});

test("chat: the heading verb drops only for an ended event", async () => {
  const page = chatSection();
  await withPage("?c=pycon-us-2027", async (bindChat, verb) => {
    await bindChat(page.section);
    assert.equal(verb.hidden, false);
  });
});

test("chat: a conference already registered in this browser shows the next steps and never starts a second sign-up", async () => {
  const page = chatSection();
  const before = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === "cc.registrations.v1" ? JSON.stringify([{ slug: "aws-reinvent-2026", registeredAt: "2026-11-15T10:00:00Z" }]) : null) };
  try {
    await withPage("?c=aws-reinvent-2026", async (bindChat, verb) => {
      await bindChat(page.section);
      assert.equal(verb.textContent, "You're registered for");
    }, { topics: ["agentic-ai"], now: Date.parse("2026-11-15T12:00:00Z") });
  } finally {
    if (before === undefined) delete globalThis.localStorage; else globalThis.localStorage = before;
  }
  assert.equal(page.log.children.length, 0, "no chat message: no second sign-up");
  assert.equal(page.form.hidden, true);
  assert.equal(page.section.dataset.gate, "registered");
  const [sentence, row] = page.gate.children;
  assert.equal(sentence.textContent, "What would you like to do next?");
  assert.equal(sentence.getAttribute("role"), "status");
  assert.equal(row.className, "btn-row");
  assert.deepEqual(row.children.map((a) => [a.textContent, a.href, a.className]), [
    ["View your schedule", "/schedule?c=aws-reinvent-2026", "btn btn--primary"],
    ["Find talks", "/onboarding?c=aws-reinvent-2026", "btn btn--secondary"],
    ["Find more conferences", "/site/#conferences", "link"],
  ]);
});

test("chat: a profile session in this browser gates a second sign-up, and does not claim this event is registered", async () => {
  const page = chatSection();
  const before = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === "cc.token" ? "live.jwt" : k === "cc.token.expiresAt" ? "2999-01-01T00:00:00Z" : null) };
  try {
    await withPage("?c=aws-reinvent-2026", async (bindChat, verb) => {
      const was = verb.textContent;
      await bindChat(page.section);
      assert.equal(verb.textContent, was, "this event is not registered here, so the heading does not change");
    }, { topics: ["agentic-ai"], now: Date.parse("2026-11-15T12:00:00Z") });
  } finally {
    if (before === undefined) delete globalThis.localStorage; else globalThis.localStorage = before;
  }
  assert.equal(page.log.children.length, 0, "no chat message: no second sign-up");
  assert.equal(page.form.hidden, true);
  assert.equal(page.section.dataset.gate, "registered");
  assert.equal(page.gate.children[0].textContent, "What would you like to do next?");
});
