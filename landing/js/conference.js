/* Conference page: fills the page from ?c=<slug>, points the QR and the register/app links at it, and shows a
   not-found state for a slug that is not in the catalogue. Plain ES module; js/qr.js draws the QR on its own and
   reads ?c= itself, so this file only keeps the canvas's slug and every link in step.
   With no ?c= the page offers the conference list: no event is assumed. */
import { loadConferences, getConference, hasEnded, withConference, setConferenceQuery, registeredPanel, VENUE_TBA } from './conferences.js';
import { showSavedTicket } from './saved-ticket.js';
import { applyAppLinks, getConferenceTopics } from './companion-api.js';
import { registeredHere } from './profile.js';

const CHOOSER_TEXT = 'Choose a conference first.';
const CONFERENCES_HREF = '/site/#conferences';
const TALK_TOPIC_LIMIT = 12;

const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const day = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); };

function formatDates(c) {
  const text = formatDatesRaw(c);
  return c && c.tentative && text ? `${text} (tentative)` : text;
}
function formatDatesRaw(c) {
  if (!c || !c.startDate) return '';
  const a = day(c.startDate), b = day(c.endDate || c.startDate);
  const wd = `${WEEKDAYS[a.getUTCDay()]} `;
  if (a.getTime() === b.getTime()) return `${wd}${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  return sameMonth
    ? `${wd}${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`
    : `${wd}${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

const slug = new URLSearchParams(location.search).get('c') || '';

/* before anything is awaited, so js/qr.js (which awaits the config first) and the links agree with the address */
if (slug) {
  $$('canvas[data-qr="self"]').forEach((cv) => cv.setAttribute('data-qr-conference', slug));
  pointLinks(slug);
}
function pointLinks(s) {
  $$('a[data-c-link]').forEach((a) => setConferenceQuery(a, s, a.getAttribute('data-via') || ''));
  /* the app pages take the conference in the query; the attribute is what js/companion-api.js rebuilds the href from */
  $$('a[data-app-link]').forEach((a) => {
    const path = a.getAttribute('data-app-link');
    if (!path) return;
    a.setAttribute('data-app-link', withConference(path, s));
    setConferenceQuery(a, s);
  });
}

function setMeta(sel, attr, value) { const el = document.querySelector(sel); if (el && value) el.setAttribute(attr, value); }

function chooserLink() {
  const a = document.createElement('a');
  a.href = CONFERENCES_HREF;
  a.textContent = 'Open the conference list';
  return a;
}

/** No ?c=: no event is assumed, so the page offers the conference list instead of one event's details. */
function showChooser() {
  const root = document.documentElement;
  root.setAttribute('data-conference-missing', '');
  const h1 = document.querySelector('#hero-h');
  if (h1) h1.textContent = 'Choose a conference';
  const lead = document.querySelector('.cc-hero .hero__lead');
  if (lead) {
    const p = document.createElement('p');
    p.append(CHOOSER_TEXT + ' ', chooserLink(), '.');
    lead.replaceChildren(p);
  }
  $$('[data-found]').forEach((el) => { el.hidden = true; });
  const event = document.querySelector('#event');
  if (event) event.hidden = true;
  const note = document.querySelector('[data-missing]');
  if (note) note.hidden = true;
  document.title = 'Choose a conference: Conference Companion';
}

function showMissing() {
  const root = document.documentElement;
  root.setAttribute('data-conference-missing', slug);
  const h1 = document.querySelector('#hero-h');
  if (h1) h1.textContent = 'Conference not found';
  const lead = document.querySelector('.cc-hero .hero__lead');
  if (lead) lead.hidden = true;
  const note = document.querySelector('[data-missing]');
  if (note) note.hidden = false;
  document.title = 'Conference not found: Conference Companion';
}

function fill(c) {
  const root = document.documentElement;
  root.setAttribute('data-conference', c.slug);
  const val = {
    name: c.name, city: c.city, venue: c.venue, summary: c.summary,
    date: formatDates(c), capacity: c.capacity ? String(c.capacity) : '',
  };
  $$('[data-c]').forEach((el) => { const k = el.getAttribute('data-c'); if (val[k]) el.textContent = val[k]; });
  /* facts the organisers have not published are left out, not guessed */
  $$('[data-c-row="capacity"]').forEach((el) => { el.hidden = !c.capacity; });
  $$('[data-c-row="site"]').forEach((el) => { el.hidden = !c.url; });
  $$('a[data-c-site]').forEach((a) => { if (c.url) a.href = c.url; });
  $$('[data-c-topics]').forEach((el) => {
    el.replaceChildren(...(c.topics || []).map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  });
  /* invented demo events say so, on the elements that show their facts */
  $$('[data-c-facts]').forEach((el) => { if (c.assumed) el.setAttribute('data-assumed', ''); else el.removeAttribute('data-assumed'); });
  const demo = document.querySelector('[data-demo-note]');
  if (demo) demo.hidden = !c.assumed;
  if (c.assumed) root.setAttribute('data-assumed', ''); else root.removeAttribute('data-assumed');
  const suffix = document.body.getAttribute('data-conference-title') || 'register by QR code or sign-in';
  document.title = `${c.name}: ${suffix}`;
  const when = c.venue === VENUE_TBA ? `${formatDates(c)}, ${c.city}` : `${formatDates(c)}, ${c.venue}, ${c.city}`;
  setMeta('meta[name="description"]', 'content', `${c.name}, ${when}. Scan the QR code to register from your phone, or continue with GitHub.`);
  setMeta('meta[property="og:title"]', 'content', document.title);
  setMeta('meta[property="og:description"]', 'content', `${when}. Register from your phone.`);
}

/**
 * The talks panel. GET /api/catalog/topics?conference=<slug> is the only public read that says whether an event
 * has published talks (it lists the tags of those talks), so an empty answer is the "not published yet" state:
 * registration is closed for the event, and the register block gives way to one notice.
 * A route that cannot answer (no ?c=, the preview server, the API down) leaves the page as it is: no guess.
 * An event that has ended says so first, whether or not it published talks: registration is closed for good.
 */
async function fillTalks(c) {
  const section = document.querySelector('[data-talk-section]');
  const body = section ? section.querySelector('[data-talks-body]') : null;
  const found = await getConferenceTopics(c.slug);
  const published = Boolean(found && found.topics.length);
  /* Already registered in this browser: the next steps replace the register block, whatever the event's state. */
  if (registeredHere(c.slug)) { showRegistered(c); return; }
  /* Ended wins over not-published: an event can be both (it ran and never published talks), and then it has ended. */
  if (hasEnded(c)) { showEnded(c, { talks: published }); return; }
  if (!body || !found) return;
  if (!found.topics.length) { showNotPublished(c); return; }
  const lead = document.createElement('p');
  lead.className = 't-lead';
  lead.textContent = `The talks published for ${c.name} cover these topics.`;
  const list = document.createElement('ul');
  list.className = 'cc-chips';
  for (const topic of found.topics.slice(0, TALK_TOPIC_LIMIT)) {
    const li = document.createElement('li');
    li.textContent = topic;
    list.append(li);
  }
  const row = document.createElement('p');
  const search = document.createElement('a');
  search.className = 'btn btn--primary';
  search.setAttribute('data-app-link', withConference('/search', c.slug));
  search.textContent = 'Search the talks';
  row.append(search);
  body.replaceChildren(lead, list, row);
  section.hidden = false;
  applyAppLinks(section).catch(() => {});
}

/**
 * The register button and its QR go. `hidden` is enough on its own: assets/system.css makes it win over the layout's
 * own `display` ([hidden] { display: none !important }), so no inline style is needed.
 */
function hideRegisterBlocks() {
  $$('[data-found]').forEach((el) => { el.hidden = true; });
}

/**
 * No published talks: POST /api/register answers 409 schedule_not_published for this event, so the register button
 * and its QR go, and the one notice says when registration opens. The (empty) talks panel stays hidden: one notice,
 * never two, and never a placeholder talk.
 */
function showNotPublished(c) {
  hideRegisterBlocks();
  const gate = document.querySelector('[data-reg-gate]');
  if (!gate) return;
  const site = document.createElement('a');
  if (c.url) {
    site.href = c.url;
    site.rel = 'noopener';
    site.textContent = 'Open the official event site';
  } else {
    site.href = CONFERENCES_HREF;
    site.textContent = 'Open the conference list';
  }
  gate.hidden = false;
  gate.replaceChildren(`Registration opens when ${c.name} publishes its talks. `, site, '.');
}

/**
 * The event has ended: registration is closed for good, so the register block gives way to one notice. The talks stay
 * readable and the official site stays one link away. The heading drops its verb: nothing is being registered for.
 */
function showEnded(c, { talks = false } = {}) {
  hideRegisterBlocks();
  $$('[data-c-verb]').forEach((el) => { el.hidden = true; });
  const gate = document.querySelector('[data-reg-gate]');
  if (!gate) return;
  const links = [];
  if (talks) {
    const browse = document.createElement('a');
    browse.href = `/search?c=${encodeURIComponent(c.slug)}`;
    browse.textContent = 'Browse the talks';
    links.push(browse);
  }
  const site = document.createElement('a');
  if (c.url) {
    site.href = c.url;
    site.rel = 'noopener';
    site.textContent = 'Open the official event site';
  } else {
    site.href = CONFERENCES_HREF;
    site.textContent = 'Open the conference list';
  }
  links.push(site);
  gate.hidden = false;
  const sentence = document.createElement('p');
  sentence.textContent = `${c.name} has ended, so registration is closed.`;
  const row = document.createElement('div');
  row.className = 'btn-row';
  row.append(...links.map((a) => { a.className = a === links[0] && talks ? 'btn btn--primary' : 'btn btn--secondary'; return a; }));
  gate.replaceChildren(sentence, row);
}

/** Registered here before: the visitor's ticket and the next steps replace the sign-up pitch. */
function showRegistered(c) {
  hideRegisterBlocks();
  $$('[data-c-verb]').forEach((el) => { el.textContent = "You're registered for"; });
  const gate = document.querySelector('[data-reg-gate]');
  if (gate) { gate.hidden = false; gate.replaceChildren(...registeredPanel(c.slug)); }
  const pitch = $$('[data-pitch]');
  pitch.forEach((el) => { el.hidden = true; });
  const ticket = document.querySelector('[data-ticket]');
  if (ticket) showSavedTicket(ticket).then((shown) => { if (!shown) pitch.forEach((el) => { el.hidden = false; }); });
}

async function init() {
  if (!slug) { showChooser(); return; }
  let c = null;
  try { await loadConferences(); } catch (e) { /* the inlined catalogue answers */ }
  try { c = getConference(slug); } catch (e) { c = null; }
  if (!c) { showMissing(); return; }
  fill(c);
  pointLinks(c.slug);
  await fillTalks(c);
}
init();

/* The word-highlight moment (assets/moments, read-only) names its host with aria-label, which a plain <p> may not carry
   (axe aria-prohibited-attr), and hides every word span. Keep the real words readable instead: drop the label and
   the aria-hidden after the moment mounts, and again if it re-splits. */
function keepWordsReadable() {
  const host = document.querySelector('.mo-wh__text');
  if (!host) return;
  const tidy = () => {
    if (host.hasAttribute('aria-label')) host.removeAttribute('aria-label');
    host.querySelectorAll('[aria-hidden="true"]').forEach(n => n.removeAttribute('aria-hidden'));
  };
  tidy();
  new MutationObserver(tidy).observe(host, { attributes: true, attributeFilter: ['aria-label', 'aria-hidden'], childList: true, subtree: true });
}
keepWordsReadable();
