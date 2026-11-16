import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AddToSchedule } from "../src/components/AddToSchedule.js";
import { Schedule } from "../src/pages/Schedule.js";
import { api, setToken } from "../src/api.js";
import { hasEnded, resetConferenceCatalogue, type ConferenceInfo } from "../src/components/PageState.js";

// Fixed catalogue dates, far from any real clock: the tests never depend on today's date.
const ENDED: ConferenceInfo = {
  slug: "ended-conference-2026",
  name: "Ended Conference",
  startDate: "2020-01-03",
  endDate: "2020-01-05",
  url: "https://example.test/ended/",
};
const UPCOMING: ConferenceInfo = {
  slug: "upcoming-conference-2027",
  name: "Upcoming Conference",
  startDate: "2999-12-01",
  endDate: "2999-12-04",
  url: "https://example.test/upcoming/",
};

/** The catalogue is a static file under /site/; the API calls are mocked per test. */
function stubCatalogue(entries: ConferenceInfo[]) {
  return vi.fn(async (url: unknown) => {
    if (String(url).includes("data/conferences.json")) return { ok: true, json: async () => entries };
    throw new Error(`unexpected fetch ${String(url)}`);
  });
}

beforeEach(() => {
  resetConferenceCatalogue();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

// ---- the shared "ended" rule
it("ends only after the last minute of endDate has passed everywhere on Earth", () => {
  const kubecon: ConferenceInfo = { slug: "kubecon-na-2026", name: "KubeCon + CloudNativeCon North America 2026", endDate: "2026-11-12" };
  const lastMoment = Date.parse("2026-11-12T23:59:59.999-12:00");
  expect(hasEnded(kubecon, lastMoment)).toBe(false);
  expect(hasEnded(kubecon, lastMoment + 1)).toBe(true);
  // Still the 12th in UTC−12, so the day is not over yet.
  expect(hasEnded(kubecon, Date.parse("2026-11-13T00:00:00Z"))).toBe(false);
  expect(hasEnded(kubecon, Date.parse("2026-11-13T11:59:59.999Z"))).toBe(false);
  expect(hasEnded(kubecon, Date.parse("2026-11-13T12:00:00Z"))).toBe(true);
});

it("never reports an event without a usable end date as ended", () => {
  expect(hasEnded(null)).toBe(false);
  expect(hasEnded({ slug: "a-conference", name: "A conference" }, Date.parse("2999-01-01T00:00:00Z"))).toBe(false);
  expect(hasEnded({ slug: "a-conference", name: "A conference", endDate: "not a date" }, Date.parse("2999-01-01T00:00:00Z")))
    .toBe(false);
});

it("defaults to the current time", () => {
  vi.useFakeTimers();
  const kubecon: ConferenceInfo = { slug: "kubecon-na-2026", name: "KubeCon", endDate: "2026-11-12" };
  vi.setSystemTime(new Date("2026-11-10T00:00:00Z"));
  expect(hasEnded(kubecon)).toBe(false);
  vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
  expect(hasEnded(kubecon)).toBe(true);
});

// ---- My schedule
it("schedule: an ended event offers the talks and the event page instead of registration", async () => {
  vi.stubGlobal("fetch", stubCatalogue([ENDED, UPCOMING]));
  const get = vi.spyOn(api, "getSchedule");
  vi.spyOn(api, "catalogTopics").mockResolvedValue({ topics: ["kubernetes"] });
  render(<MemoryRouter initialEntries={["/schedule?c=ended-conference-2026"]}><Schedule /></MemoryRouter>);
  expect(await screen.findByText(/Ended Conference has ended, so registration is closed\./)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Browse the talks" }).getAttribute("href")).toBe("/search?c=ended-conference-2026");
  expect(screen.getByRole("link", { name: "Open the event page" }).getAttribute("href"))
    .toBe("/site/conference.html?c=ended-conference-2026");
  expect(screen.queryByRole("link", { name: "Register now" })).toBeNull();
  expect(get).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("schedule: an ended event with no programme still says it has ended and drops the talks link", async () => {
  vi.stubGlobal("fetch", stubCatalogue([ENDED, UPCOMING]));
  vi.spyOn(api, "getSchedule");
  vi.spyOn(api, "catalogTopics").mockResolvedValue({ topics: [] });
  render(<MemoryRouter initialEntries={["/schedule?c=ended-conference-2026"]}><Schedule /></MemoryRouter>);
  // Ended wins over "not published": the notice is the ended one, not the promise of future registration.
  expect(await screen.findByText(/Ended Conference has ended, so registration is closed\./)).toBeTruthy();
  expect(screen.queryByText(/have not been published yet/)).toBeNull();
  expect(screen.queryByRole("link", { name: "Browse the talks" })).toBeNull();
  expect(screen.getByRole("link", { name: "Open the event page" }).getAttribute("href"))
    .toBe("/site/conference.html?c=ended-conference-2026");
  expect(screen.queryByRole("link", { name: "Register now" })).toBeNull();
});

it("schedule: an upcoming event keeps asking visitors to register", async () => {
  vi.stubGlobal("fetch", stubCatalogue([ENDED, UPCOMING]));
  vi.spyOn(api, "getSchedule");
  vi.spyOn(api, "catalogTopics").mockResolvedValue({ topics: ["kubernetes"] });
  render(<MemoryRouter initialEntries={["/schedule?c=upcoming-conference-2027"]}><Schedule /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Register now" }).getAttribute("href")).toBe("/site/register.html?c=upcoming-conference-2027");
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.getByRole("link", { name: "Register now" })).toBeTruthy();
  expect(screen.queryByText(/has ended, so registration is closed/)).toBeNull();
});

it("schedule: an attendee who already has a session keeps their schedule", async () => {
  vi.stubGlobal("fetch", stubCatalogue([ENDED]));
  setToken("session");
  const talk = { id: "t1", title: "Wrapping up Kubernetes", speaker: "Demo Speaker", abstract: "",
    track: "Security", room: "Room A", start: "2020-01-04T10:00:00Z", end: "2020-01-04T11:00:00Z", tags: [] };
  vi.spyOn(api, "catalogTopics").mockResolvedValue({ topics: ["kubernetes"] });
  vi.spyOn(api, "getSchedule").mockResolvedValue({ items: [{ talk, reason: "" }], updatedAt: "" });
  render(<MemoryRouter initialEntries={["/schedule?c=ended-conference-2026"]}><Schedule /></MemoryRouter>);
  expect(await screen.findByText(talk.title)).toBeTruthy();
  expect(screen.queryByText(/has ended, so registration is closed/)).toBeNull();
  expect(screen.queryByRole("link", { name: "Register now" })).toBeNull();
});

// ---- Add to my schedule (talk page)
it("add to schedule: an ended event states that registration is closed instead of linking to it", async () => {
  vi.stubGlobal("fetch", stubCatalogue([ENDED, UPCOMING]));
  render(<MemoryRouter initialEntries={["/talks/src?c=ended-conference-2026"]}>
    <AddToSchedule talkId="src" hasSession={() => false} schedule={{ getSchedule: vi.fn(), saveSchedule: vi.fn() }} />
  </MemoryRouter>);
  expect(await screen.findByText("Ended Conference has ended, so registration is closed.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  expect(screen.queryByRole("link", { name: /register/i })).toBeNull();
});

it("add to schedule: an upcoming event still links to registration", async () => {
  vi.stubGlobal("fetch", stubCatalogue([ENDED, UPCOMING]));
  render(<MemoryRouter initialEntries={["/talks/src?c=upcoming-conference-2027"]}>
    <AddToSchedule talkId="src" hasSession={() => false} schedule={{ getSchedule: vi.fn(), saveSchedule: vi.fn() }} />
  </MemoryRouter>);
  expect(screen.getByRole("link", { name: "Register" }).getAttribute("href"))
    .toBe("/site/register.html?c=upcoming-conference-2027");
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.getByRole("link", { name: "Register" })).toBeTruthy();
  expect(screen.queryByText(/has ended, so registration is closed/)).toBeNull();
});

it("add to schedule: a registered attendee of an ended event still adds talks", async () => {
  vi.stubGlobal("fetch", stubCatalogue([ENDED]));
  vi.spyOn(api, "getSchedule").mockResolvedValue({ items: [], updatedAt: "" });
  render(<MemoryRouter initialEntries={["/talks/src?c=ended-conference-2026"]}>
    <AddToSchedule talkId="src" hasSession={() => true} />
  </MemoryRouter>);
  expect(await screen.findByRole("button", { name: "Add to my schedule" })).toBeTruthy();
  expect(screen.queryByText(/has ended, so registration is closed/)).toBeNull();
});
