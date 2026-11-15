import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api, conferenceFromLocation } from "../src/api.js";
import { resetConferenceCatalogue } from "../src/components/PageState.js";
import { Onboarding } from "../src/pages/Onboarding.js";
import { Schedule } from "../src/pages/Schedule.js";
import { Search } from "../src/pages/Search.js";

const CATALOGUE = [
  { slug: "pycon-us-2027", name: "PyCon US", url: "https://us.pycon.org/2027/" },
  {
    slug: "kubecon-na-2026",
    name: "KubeCon + CloudNativeCon North America 2026",
    url: "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/",
  },
];

/** The catalogue is a static file under /site/; the API calls are mocked per test. */
function stubCatalogue() {
  return vi.fn(async (url: unknown) => {
    if (String(url).includes("data/conferences.json")) return { ok: true, json: async () => CATALOGUE };
    throw new Error(`unexpected fetch ${String(url)}`);
  });
}

const answers = { topics: [], experience: "beginner" as const, goals: [], freeText: "" };

beforeEach(() => {
  resetConferenceCatalogue();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("sends the conference slug on every scoped API call", async () => {
  const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
  await api.onboarding({ answers }, "pycon-us-2027");
  await api.search("kubernetes", "keyword", false, {}, "pycon-us-2027");
  await api.catalogTopics("pycon-us-2027");
  await api.roomOccupancy("pycon-us-2027");
  await api.roomPlacement("", "pycon-us-2027");
  await api.saveSchedule({ answers }, "pycon-us-2027");
  const urls = fetchMock.mock.calls.map(([url]) => String(url));
  for (const path of ["/api/onboarding", "/api/search", "/api/catalog/topics", "/api/rooms/occupancy", "/api/rooms/placement", "/api/schedule"]) {
    expect(urls.some((url) => url.startsWith(path) && url.includes("conference=pycon-us-2027"))).toBe(true);
  }
});

it("keeps a talkIds save a by-id lookup with no conference query", async () => {
  const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
  await api.saveSchedule({ talkIds: ["a"] });
  expect(fetchMock.mock.calls[0]![0]).toBe("/api/schedule");
});

it("refuses to call a scoped route without a slug", async () => {
  const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(api.catalogTopics(null)).rejects.toMatchObject({ status: 400, code: "conference_required" });
  await expect(api.onboarding({ answers }, null)).rejects.toMatchObject({ code: "conference_required" });
  // A slug that is not in the catalogue's shape is a bad request, not a different event.
  await expect(api.search("q", "keyword", false, {}, "Not A Slug")).rejects.toMatchObject({ code: "invalid_request" });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("reads the conference slug from the page address", () => {
  window.history.replaceState(null, "", "/search?c=pycon-us-2027");
  expect(conferenceFromLocation()).toBe("pycon-us-2027");
  window.history.replaceState(null, "", "/search");
  expect(conferenceFromLocation()).toBeNull();
  window.history.replaceState(null, "", "/search?c=Not%20A%20Slug");
  expect(conferenceFromLocation()).toBeNull();
});

it("search names the unpublished event and points at its official site", async () => {
  vi.stubGlobal("fetch", stubCatalogue());
  const search = vi.spyOn(api, "search")
    .mockImplementation(async (q, mode) => ({ q, mode, tookMs: 1, hits: [] }));
  vi.spyOn(api, "catalogTopics").mockResolvedValue({ topics: [] });
  render(<MemoryRouter initialEntries={["/search?c=pycon-us-2027"]}><Search /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Query"), { target: { value: "kubernetes" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText(/Talks for PyCon US have not been published yet/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open the official event site" }).getAttribute("href"))
    .toBe("https://us.pycon.org/2027/");
  expect(screen.queryByText(/No matching talks/)).toBeNull();
  // The scoped search carried the address's conference.
  expect(search.mock.calls[0]?.[4]).toBe("pycon-us-2027");
});

it("search keeps the query advice when the conference does publish talks", async () => {
  vi.stubGlobal("fetch", stubCatalogue());
  vi.spyOn(api, "search").mockImplementation(async (q, mode) => ({ q, mode, tookMs: 1, hits: [] }));
  vi.spyOn(api, "catalogTopics").mockResolvedValue({ topics: ["kubernetes"] });
  render(<MemoryRouter initialEntries={["/search?c=kubecon-na-2026"]}><Search /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Query"), { target: { value: "zzzz" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect((await screen.findAllByText(/No matching talks/)).length).toBe(2);
  expect(screen.queryByText(/have not been published yet/)).toBeNull();
});

it("schedule shows the unpublished notice instead of registration for an empty event", async () => {
  vi.stubGlobal("fetch", stubCatalogue());
  vi.spyOn(api, "catalogTopics").mockResolvedValue({ topics: [] });
  render(<MemoryRouter initialEntries={["/schedule?c=pycon-us-2027"]}><Schedule /></MemoryRouter>);
  expect(await screen.findByText(/Talks for PyCon US have not been published yet/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open the official event site" }).getAttribute("href"))
    .toBe("https://us.pycon.org/2027/");
  expect(screen.queryByRole("link", { name: "Register now" })).toBeNull();
});

it("onboarding shows the unpublished notice instead of blaming the query", async () => {
  vi.stubGlobal("fetch", stubCatalogue());
  vi.spyOn(api, "catalogTopics").mockResolvedValue({ topics: [] });
  vi.spyOn(api, "onboarding").mockResolvedValue({ query: { text: "kubernetes", topics: [], mode: "keyword" } });
  const search = vi.spyOn(api, "search")
    .mockImplementation(async (q, mode) => ({ q, mode, tookMs: 1, hits: [] }));
  render(<MemoryRouter initialEntries={["/onboarding?c=pycon-us-2027"]}><Onboarding /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("What would you like to learn, in your own words?"), { target: { value: "kubernetes" } });
  fireEvent.click(screen.getByRole("button", { name: "Find talks" }));
  expect(await screen.findByText(/Talks for PyCon US have not been published yet/)).toBeTruthy();
  expect(screen.queryByText(/No matching talks found/)).toBeNull();
  expect(search.mock.calls[0]?.[4]).toBe("pycon-us-2027");
});
