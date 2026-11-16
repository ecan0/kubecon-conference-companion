import { test } from "node:test";
import assert from "node:assert/strict";

/** The smallest DOM js/conference.js touches, so the page glue can run under node:test. */
class El {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = new Map();
    this.hidden = false;
    this.textContent = "";
    this.style = {};
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  removeAttribute(name) { this.attrs.delete(name); }
  // `a.href = …` and `a.search = …` reflect to the attribute, as they do in the DOM
  get href() { return this.getAttribute("href") ?? ""; }
  set href(value) { this.setAttribute("href", value); }
  get search() { return new URL(this.href, "http://localhost:4310").search; }
  set search(value) {
    const u = new URL(this.href, "http://localhost:4310");
    u.search = value;
    this.setAttribute("href", /^https?:/.test(this.href) ? u.href : u.pathname + u.search + u.hash);
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function page({ search = "", appLinks = [] } = {}) {
  const h1 = new El("h1");
  const lead = new El("p");
  const missing = new El("div");
  const event = new El("section");
  const qr = new El("div");
  const act = new El("div");
  const verb = new El("span"); // the h1's "Register for"
  const gate = new El("p");
  gate.hidden = true; // the markup starts hidden; js/conference.js fills it only when the talks are unpublished
  const talks = new El("section");
  talks.hidden = true; // the markup starts hidden; js/conference.js unhides it once it has something to say
  const talksBody = new El("div");
  talks.querySelector = (sel) => (sel === "[data-talks-body]" ? talksBody : null);
  const doc = {
    documentElement: new El("html"),
    body: new El("body"),
    title: "",
    createElement: (tag) => new El(tag),
    querySelector(sel) {
      if (sel === "#hero-h") return h1;
      if (sel === ".cc-hero .hero__lead") return lead;
      if (sel === "[data-missing]") return missing;
      if (sel === "#event") return event;
      if (sel === "[data-talk-section]") return talks;
      if (sel === "[data-reg-gate]") return gate;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-found]") return [qr, act];
      if (sel === "a[data-app-link]") return appLinks;
      if (sel === "[data-c-verb]") return [verb];
      if (sel === 'canvas[data-qr="self"]') return [];
      return [];
    },
  };
  return { doc, h1, lead, missing, event, qr, act, verb, gate, talks, talksBody, search };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/** Stubs the API for one test; every other request (the catalogue file) misses, so the inlined copy answers. */
async function withApi(handler, fn) {
  const real = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, init = {}) => {
    const request = String(url);
    if (!request.startsWith("/api/")) return new Response("", { status: 404 });
    urls.push(request);
    return handler(request, init);
  };
  try { return await fn(urls); } finally { globalThis.fetch = real; }
}

/**
 * Runs js/conference.js against the stub page; each call is a fresh module instance (query string busts the cache).
 * init() is async and reads the talks panel after filling the page, so `settle` (when given) is polled for a few
 * macrotask ticks; without it the loop just drains the awaited fetches.
 */
async function load(stub, tag, settle = null) {
  const saved = { document: globalThis.document, location: globalThis.location };
  Object.defineProperty(globalThis, "document", { value: stub.doc, configurable: true, writable: true });
  globalThis.location = { search: stub.search, origin: "http://localhost:4310" };
  try {
    await import(`../js/conference.js?${tag}`);
    for (let i = 0; i < 20; i++) {
      if (settle && settle()) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    Object.defineProperty(globalThis, "document", { value: saved.document, configurable: true, writable: true });
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
}

test("conference page without ?c= shows the chooser, not an assumed event", async () => {
  const stub = page();
  await load(stub, "no-conference");
  assert.equal(stub.h1.textContent, "Choose a conference");
  const notice = stub.lead.children[0];
  assert.ok(notice, "the hero lead carries the chooser");
  assert.equal(notice.children[0], "Choose a conference first. ");
  assert.equal(notice.children[1].textContent, "Open the conference list");
  assert.equal(notice.children[1].href, "/site/#conferences");
  assert.equal(notice.children[2], ".");
  assert.equal(stub.qr.hidden, true, "no QR code for an event that was not chosen");
  assert.equal(stub.act.hidden, true);
  assert.equal(stub.event.hidden, true, "the event facts stay hidden until an event is chosen");
  assert.equal(stub.doc.documentElement.getAttribute("data-conference-missing"), "");
  assert.match(stub.doc.title, /^Choose a conference/);
});

test("conference page with ?c= puts the conference on its app links", async () => {
  const nav = new El("a");
  nav.setAttribute("data-app-link", "/schedule");
  nav.setAttribute("href", "http://localhost:5173/schedule");
  const tile = new El("a");
  tile.setAttribute("data-app-link", "/search");
  tile.setAttribute("href", "http://localhost:5173/search?mode=hybrid");
  const stub = page({ search: "?c=pycon-us-2027", appLinks: [nav, tile] });
  await load(stub, "with-conference");
  assert.equal(nav.getAttribute("href"), "http://localhost:5173/schedule?c=pycon-us-2027");
  assert.equal(nav.getAttribute("data-app-link"), "/schedule?c=pycon-us-2027");
  assert.equal(tile.getAttribute("href"), "http://localhost:5173/search?mode=hybrid&c=pycon-us-2027");
  assert.equal(stub.qr.hidden, false);
  assert.equal(stub.gate.hidden, true, "an event that has not ended and has no talks answer keeps the page as it is");
});

test("conference page talks: a conference with published talks shows their topics, never a placeholder talk", async () => {
  const stub = page({ search: "?c=pycon-us-2027" });
  await withApi(() => json({ topics: ["python", "tooling", "testing"] }), async (urls) => {
    await load(stub, "talks-published", () => stub.talks.hidden === false);
    assert.deepEqual(urls, ["/api/catalog/topics?conference=pycon-us-2027"], "the scoped read carries the conference");
  });
  assert.equal(stub.talks.hidden, false);
  const [lead, chips, row] = stub.talksBody.children;
  assert.equal(stub.talksBody.children.length, 3);
  assert.match(lead.textContent, /PyCon US/);
  assert.deepEqual(chips.children.map((li) => li.textContent), ["python", "tooling", "testing"]);
  assert.equal(row.children[0].textContent, "Search the talks");
  assert.equal(row.children[0].getAttribute("data-app-link"), "/search?c=pycon-us-2027");
  assert.equal(stub.gate.hidden, true, "a published event keeps its register block, not the notice");
  assert.equal(stub.qr.hidden, false);
  assert.equal(stub.act.hidden, false);
  assert.equal(stub.verb.hidden, false, "an event that has not ended keeps its heading verb");
});

test("conference page talks: a conference with no published talks gets the register notice instead of a chat that refuses it", async () => {
  const stub = page({ search: "?c=pycon-us-2027" });
  await withApi(() => json({ topics: [] }), async (urls) => {
    await load(stub, "talks-none", () => stub.gate.hidden === false);
    assert.deepEqual(urls, ["/api/catalog/topics?conference=pycon-us-2027"]);
  });
  assert.equal(stub.talks.hidden, true, "the empty talks panel stays hidden: one notice, never two");
  assert.equal(stub.talksBody.children.length, 0, "no placeholder talk is rendered");
  assert.equal(stub.qr.hidden, true, "no registration QR for an event that cannot register");
  assert.equal(stub.act.hidden, true, "no register button either");
  assert.equal(stub.gate.hidden, false);
  assert.equal(stub.verb.hidden, false, "the event has not ended: the heading still offers registration");
  const [text, link, full] = stub.gate.children;
  assert.equal(text, "Registration opens when PyCon US publishes its talks. ");
  assert.equal(link.textContent, "Open the official event site");
  assert.equal(link.href, "https://us.pycon.org/2027/");
  assert.equal(full, ".");
});

test("conference page talks: an event with no official site points at the conference list instead", async () => {
  const stub = page({ search: "?c=cloud-native-hackathon-slc-2026" }); // over on 9 November, and no url
  await withApi(() => json({ topics: [] }), () => load(stub, "talks-none-no-url", () => stub.gate.hidden === false));
  const [sentence, row] = stub.gate.children;
  assert.equal(sentence.textContent, "Cloud Native Hackathon has ended, so registration is closed.");
  const [link] = row.children;
  assert.equal(link.textContent, "Open the conference list");
  assert.equal(link.href, "/site/#conferences");
});

test("conference page: an ended event hides the register block and says so, with its talks and its official site", async () => {
  const stub = page({ search: "?c=kubecon-na-2026" }); // ended on 12 November, talks published
  await withApi(() => json({ topics: ["kubernetes", "observability"] }), async (urls) => {
    await load(stub, "ended-with-talks", () => stub.gate.hidden === false);
    assert.deepEqual(urls, ["/api/catalog/topics?conference=kubecon-na-2026"], "the talks are still read: they stay readable");
  });
  assert.equal(stub.qr.hidden, true, "no registration QR for an event that has ended");
  assert.equal(stub.act.hidden, true, "no register button either");
  assert.equal(stub.verb.hidden, true, "the heading reads the event name alone: nothing is being registered for");
  assert.equal(stub.gate.hidden, false);
  assert.equal(stub.talks.hidden, true, "the topics panel gives way to the one notice");
  const [sentence, row] = stub.gate.children;
  assert.equal(sentence.textContent, "KubeCon + CloudNativeCon North America 2026 has ended, so registration is closed.");
  const [browse, site] = row.children;
  assert.equal(browse.textContent, "Browse the talks");
  assert.equal(browse.href, "/search?c=kubecon-na-2026");
  assert.equal(site.textContent, "Open the official event site");
  assert.equal(site.href, "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/");
});

test("conference page: ended wins over not published, so the ended notice is the one that shows", async () => {
  const stub = page({ search: "?c=kubecon-na-2026" }); // ended, and the API knows of no talks
  await withApi(() => json({ topics: [] }), () => load(stub, "ended-no-talks", () => stub.gate.hidden === false));
  const [sentence, row] = stub.gate.children;
  assert.equal(sentence.textContent, "KubeCon + CloudNativeCon North America 2026 has ended, so registration is closed.");
  const [site] = row.children;
  assert.equal(site.textContent, "Open the official event site", "no talks link when there are no talks to browse");
  assert.equal(stub.qr.hidden, true);
  assert.equal(stub.act.hidden, true);
});

test("conference page talks: when the route cannot answer, the panel stays hidden rather than guessing", async () => {
  const stub = page({ search: "?c=pycon-us-2027" });
  await withApi(() => new Response("", { status: 404 }), () => load(stub, "talks-unavailable"));
  assert.equal(stub.talks.hidden, true);
  assert.equal(stub.talksBody.children.length, 0);
});

test("conference page without ?c= makes no scoped call and shows no talks panel", async () => {
  const stub = page();
  await withApi(() => json({ topics: ["x"] }), async (urls) => {
    await load(stub, "no-conference-talks");
    assert.deepEqual(urls, [], "nothing is fetched for an event that was not chosen");
  });
  assert.equal(stub.talks.hidden, true);
});
