// Conference catalogue for the landing pages. Plain ES module, no dependencies.
// The first entry is the event this app was built for; the others are real events with their organisers' public details
// (`url` is the official site). `tentative: true` marks dates that the organisers have not confirmed yet.

/** The venue text for an event whose organisers have not named a venue yet. */
export const VENUE_TBA = "Venue to be announced";

/** Inlined copy of data/conferences.json, used when the file cannot be fetched. Kept identical by a test. */
export const FALLBACK_CONFERENCES = [
  {
    slug: "cloud-native-hackathon-slc-2026",
    name: "Cloud Native Hackathon",
    startDate: "2026-11-09",
    endDate: "2026-11-09",
    city: "Salt Lake City",
    district: "Downtown",
    venue: "The Shop Workspace",
    topics: ["search", "observability", "kubernetes", "ai sre", "code review"],
    summary: "One-day hackathon with talks and builds on search, observability, Kubernetes, AI SRE and code review.",
    capacity: 200,
    assumed: false,
    wifi: { ssid: "CloudNativeHack-Guest", security: "WPA", password: "shipit-slc-2026", assumed: true },
  },
  {
    slug: "kubecon-na-2026",
    name: "KubeCon + CloudNativeCon North America 2026",
    startDate: "2026-11-09",
    endDate: "2026-11-12",
    city: "Salt Lake City",
    district: "Downtown",
    venue: "Hyatt Regency Salt Lake City",
    topics: ["kubernetes", "ai", "oss", "end-user-talk", "maintainer-track"],
    summary: "The Linux Foundation's flagship cloud native conference: talks, workshops and co-located events on Kubernetes and the CNCF projects.",
    assumed: false,
    url: "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/",
  },
  {
    slug: "aws-reinvent-2026",
    name: "AWS re:Invent",
    startDate: "2026-11-30",
    endDate: "2026-12-04",
    city: "Las Vegas",
    venue: "Venue to be announced",
    topics: ["cloud", "aws", "serverless", "ai"],
    summary: "AWS's annual cloud conference: sessions, workshops and hands-on labs on infrastructure, data and AI.",
    assumed: false,
    url: "https://aws.amazon.com/reinvent",
  },
  {
    slug: "scale-24x-2027",
    name: "SCaLE 24x",
    startDate: "2027-04-01",
    endDate: "2027-04-04",
    city: "Pasadena",
    venue: "Pasadena Convention Center",
    topics: ["open source", "linux", "devops", "community"],
    summary: "North America's largest community-run open source conference, with talks on Linux and infrastructure.",
    assumed: false,
    url: "https://www.socallinuxexpo.org/scale/24x",
  },
  {
    slug: "srecon27-americas",
    name: "SREcon27 Americas",
    startDate: "2027-04-12",
    endDate: "2027-04-14",
    city: "Seattle",
    venue: "Sheraton Grand Seattle",
    topics: ["site reliability", "observability", "incident response", "distributed systems"],
    summary: "Engineers on site reliability, systems engineering and running complex distributed systems at scale.",
    assumed: false,
    url: "https://www.usenix.org/conference/srecon27americas",
  },
  {
    slug: "google-cloud-next-2027",
    name: "Google Cloud Next",
    startDate: "2027-04-13",
    endDate: "2027-04-15",
    city: "Las Vegas",
    venue: "Mandalay Bay Convention Center",
    topics: ["cloud", "ai", "kubernetes", "data"],
    summary: "Google Cloud's yearly event on cloud and AI, with sessions, demos and hands-on learning.",
    assumed: false,
    url: "https://www.googlecloudevents.com/next-vegas",
  },
  {
    slug: "confidential-computing-summit-2027",
    name: "Confidential Computing Summit",
    startDate: "2027-04-19",
    endDate: "2027-04-20",
    city: "San Francisco",
    venue: "Venue to be announced",
    topics: ["confidential computing", "security", "privacy", "ai"],
    summary: "Enterprise AI, data and security leaders on deploying AI securely with confidential computing.",
    assumed: false,
    url: "https://events.linuxfoundation.org/confidential-computing-summit/",
  },
  {
    slug: "agntcon-mcpcon-na-2027",
    name: "AGNTCon + MCPCon North America",
    startDate: "2027-04-28",
    endDate: "2027-04-29",
    city: "San Francisco",
    venue: "Moscone Center",
    topics: ["mcp", "ai agents", "agentic ai", "security"],
    summary: "Open agentic AI conference on MCP, agent engineering, evals, security and multi-agent systems.",
    assumed: false,
    url: "https://events.linuxfoundation.org/agntcon-mcpcon-north-america/",
  },
  {
    slug: "pycon-us-2027",
    name: "PyCon US",
    startDate: "2027-05-12",
    endDate: "2027-05-18",
    city: "Long Beach",
    venue: "Venue to be announced",
    topics: ["python", "open source", "machine learning", "community"],
    summary: "The Python community's annual conference, with talks, tutorials and sprints for developers at every level.",
    assumed: false,
    tentative: true,
    url: "https://us.pycon.org/2027/",
  },
  {
    slug: "black-hat-usa-2027",
    name: "Black Hat USA",
    startDate: "2027-07-31",
    endDate: "2027-08-05",
    city: "Las Vegas",
    venue: "Venue to be announced",
    topics: ["security", "information security", "training", "research"],
    summary: "Technical information security briefings, hands-on trainings and an expo for security professionals.",
    assumed: false,
    url: "https://www.blackhat.com/",
  },
  {
    slug: "pytorch-conference-2027",
    name: "PyTorch Conference",
    startDate: "2027-10-06",
    endDate: "2027-10-07",
    city: "San Jose",
    venue: "Venue to be announced",
    topics: ["pytorch", "machine learning", "ai", "open source"],
    summary: "AI leaders and builders pushing open source AI forward, centred on the PyTorch ecosystem.",
    assumed: false,
    url: "https://events.linuxfoundation.org/pytorch-conference-2027/",
  },
  {
    slug: "agntsummit-nyc-2027",
    name: "AGNTSummit New York City",
    startDate: "2027-11-01",
    endDate: "2027-11-02",
    city: "New York",
    venue: "Venue to be announced",
    topics: ["mcp", "ai agents", "agentic ai", "open source"],
    summary: "Developer summit on building and deploying agentic AI systems, with MCP at its core.",
    assumed: false,
    url: "https://events.linuxfoundation.org/agntsummit-new-york-city/",
  },
  {
    slug: "kubecon-na-2027",
    name: "KubeCon + CloudNativeCon North America",
    startDate: "2027-11-08",
    endDate: "2027-11-11",
    city: "New Orleans",
    venue: "Venue to be announced",
    topics: ["kubernetes", "cloud native", "ai infrastructure", "open source"],
    summary: "CNCF's flagship conference: Kubernetes, cloud native projects and the infrastructure behind AI.",
    assumed: false,
    url: "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america-2027/",
  },
];

let cache = null;

const isConference = (c) =>
  c && typeof c === "object" && typeof c.slug === "string" && typeof c.name === "string" &&
  typeof c.startDate === "string" && Array.isArray(c.topics);

/** Fetches data/conferences.json (relative to this module); falls back to the inlined copy. */
export async function loadConferences() {
  if (cache) return cache;
  try {
    const r = await fetch(new URL("../data/conferences.json", import.meta.url), { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("conferences");
    const list = await r.json();
    if (!Array.isArray(list) || list.length === 0 || !list.every(isConference)) throw new Error("conferences");
    cache = list;
  } catch {
    cache = FALLBACK_CONFERENCES;
  }
  return cache;
}

const localIsoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayIso = () => localIsoDay(new Date());

/**
 * The event the home page features: the soonest real (not `assumed`) event that has not ended by `today`
 * (YYYY-MM-DD, default the visitor's date); once every real event is over, the latest one.
 */
export function nextEvent(list, today = todayIso()) {
  const real = list.filter((c) => !c.assumed).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  return real.find((c) => String(c.endDate || c.startDate) >= today) || real[real.length - 1] || null;
}

/**
 * True once the event has ended everywhere on Earth: `now` is later than the end of `endDate` in the last time
 * zone (−12:00), so its last day still counts as running wherever the visitor is. `now` is a parameter so tests
 * never depend on the clock. An event with no usable date has not ended.
 */
export function hasEnded(conference, now = Date.now()) {
  const endDate = conference?.endDate || conference?.startDate;
  if (typeof endDate !== "string") return false;
  const end = Date.parse(`${endDate}T23:59:59.999-12:00`);
  return Number.isFinite(end) && now > end;
}

/** Test hook. */
export function resetConferencesCache() {
  cache = null;
}

/** Approximate city centres for "near me" (within a few km). A city not listed here has no distance, so it never matches. */
export const CITY_CENTRES = Object.freeze({
  "Salt Lake City": { lat: 40.7608, lng: -111.891 },
  "Las Vegas": { lat: 36.1699, lng: -115.1398 },
  Pasadena: { lat: 34.1478, lng: -118.1445 },
  Seattle: { lat: 47.6062, lng: -122.3321 },
  "San Francisco": { lat: 37.7749, lng: -122.4194 },
  "Long Beach": { lat: 33.7701, lng: -118.1937 },
  "San Jose": { lat: 37.3382, lng: -121.8863 },
  "New York": { lat: 40.7128, lng: -74.006 },
  "New Orleans": { lat: 29.9511, lng: -90.0715 },
});

/** The city centre of an event, or null when its city is not in CITY_CENTRES. */
export function centreOf(c) {
  return CITY_CENTRES[c?.city] ?? null;
}

/** Great-circle distance between two { lat, lng } points, in km. */
export function distanceKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The day `months` after an ISO day (YYYY-MM-DD), clamped to the last day of that month. */
function plusMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * Case-insensitive filter. A condition that is given must hold; an omitted one does not apply.
 *  q          every whitespace-separated word must appear in name, city, topics or summary
 *  topic      exact topic tag (case-insensitive); "" or "all" = any
 *  month      "YYYY-MM" (conference runs in that month) or "1".."12"/"01".."12" (that month in any year); "" or "all" = any
 *  upcoming   true: drop events that have ended
 *  nextMonths true: keep events that have not ended and start within six months of `now`
 *  near       { from: { lat, lng }, km }: keep events whose city centre is within km of `from`
 *  withTalks  a Set of slugs with published talks: keep only those (null = no talk filter)
 *  now        the Date the time filters use (default: now)
 */
export function filterConferences(list, { q = "", topic = "", month = "", upcoming = false, nextMonths = false, near = null, withTalks = null, now = new Date() } = {}) {
  const words = String(q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const t = String(topic ?? "").trim().toLowerCase();
  const m = String(month ?? "").trim();
  const nowMs = now.getTime();
  const cutoff = plusMonths(localIsoDay(now), 6);
  return list.filter((c) => {
    if (words.length) {
      const hay = [c.name, c.city, ...(c.topics ?? []), c.summary].join(" ").toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (t && t !== "all" && !(c.topics ?? []).some((x) => String(x).toLowerCase() === t)) return false;
    if (m && m.toLowerCase() !== "all" && !inMonth(c, m)) return false;
    if (upcoming && hasEnded(c, nowMs)) return false;
    if (nextMonths && (hasEnded(c, nowMs) || String(c.startDate) > cutoff)) return false;
    if (near) {
      const at = centreOf(c);
      if (!at || distanceKm(near.from, at) > near.km) return false;
    }
    if (withTalks && !withTalks.has(c.slug)) return false;
    return true;
  });
}

function inMonth(c, month) {
  const start = String(c.startDate).slice(0, 7);
  const end = String(c.endDate ?? c.startDate).slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(month)) return start <= month && month <= end;
  if (/^\d{1,2}$/.test(month)) {
    const mm = month.padStart(2, "0");
    return start.slice(5) === mm || end.slice(5) === mm;
  }
  return false;
}

/** Looks a conference up by slug in the loaded list (or the inlined copy before it has loaded). */
export function getConference(slug) {
  return (cache ?? FALLBACK_CONFERENCES).find((c) => c.slug === slug);
}

/** The same path, query and hash with `c=<slug>` set, so a link keeps the conference the visitor is looking at. */
export function withConference(href, slug) {
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : beforeHash.slice(queryAt + 1));
  params.set("c", slug);
  return `${path}?${params}${hash}`;
}

/** Where a registered visitor goes next: their schedule, the talks, other conferences. */
export function nextSteps(slug) {
  const c = encodeURIComponent(slug);
  return [
    { href: `/schedule?c=${c}`, text: "View your schedule", className: "btn btn--primary" },
    { href: `/onboarding?c=${c}`, text: "Find talks", className: "btn btn--secondary" },
    { href: "/site/#conferences", text: "Find more conferences", className: "link" },
  ];
}

/** The next steps for a registered visitor (the heading already says they are registered): a short prompt over a button row. `status` makes the prompt a live region. */
export function registeredPanel(slug, { status = false } = {}) {
  const p = document.createElement("p");
  if (status) p.setAttribute("role", "status");
  p.textContent = "What would you like to do next?";
  const row = document.createElement("div");
  row.className = "btn-row";
  row.append(...nextSteps(slug).map(({ href, text, className }) => {
    const a = document.createElement("a");
    a.href = href;
    a.className = className;
    a.textContent = text;
    return a;
  }));
  return [p, row];
}

/** Puts c=<slug> (and an optional via) into a link's query. The link keeps its own address and hash: page text never becomes its href. */
export function setConferenceQuery(a, slug, via = '') {
  const params = new URLSearchParams(a.search);
  params.set('c', slug);
  if (via) params.set('via', via);
  a.search = params.toString();
}
