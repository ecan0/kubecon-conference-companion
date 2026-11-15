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
 * answers, and the scoped topics route reports no published talks.
 */
async function withPage(search, fn) {
  const saved = { document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch };
  const doc = { readyState: "complete", querySelectorAll: () => [], createElement: (tag) => new El(tag) };
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  globalThis.location = { pathname: "/site/register.html", origin: "http://app.test:5173", search };
  globalThis.fetch = async (url) => (String(url).startsWith("/api/catalog/topics") ? json({ topics: [] }) : new Response("", { status: 404 }));
  try {
    const { bindChat } = await import("../js/chat.js");
    return await fn(bindChat);
  } finally {
    globalThis.fetch = saved.fetch;
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
  const [text, link, full] = notice.children;
  assert.equal(text, "Registration opens when PyCon US publishes its talks. ");
  assert.equal(link.textContent, "Open the official event site");
  assert.equal(link.href, "https://us.pycon.org/2027/");
  assert.equal(full, ".");
});

test("chat: without the register page's gate element the same notice goes into the log", async () => {
  const page = chatSection({ withGate: false });
  await withPage("?c=pycon-us-2027", async (bindChat) => { await bindChat(page.section); });
  assert.equal(page.log.children.length, 1);
  const li = page.log.children[0];
  assert.equal(li.dataset.role, "assistant");
  assert.equal(li.children.length, 1);
  const [text, link] = li.children[0].children;
  assert.equal(text, "Registration opens when PyCon US publishes its talks. ");
  assert.equal(link.href, "https://us.pycon.org/2027/");
  assert.ok(["Open the official event site", "Open the conference list"].includes(link.textContent));
});
