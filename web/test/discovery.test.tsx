import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Search } from "../src/pages/Search.js";
import { Schedule } from "../src/pages/Schedule.js";
import { api, ApiError, setToken } from "../src/api.js";

// Search persists its query in the URL; reset it so one test does not auto-run the next one's search.
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });
const talk = { id: "talk", title: "Secure Kubernetes", speaker: "Demo Speaker", abstract: "Supply chain security",
  track: "Security", room: "Room A", start: "2026-11-09T10:00:00Z", end: "2026-11-09T11:00:00Z", tags: [] };

it("compares both methods and displays the server query", async () => {
  const search = vi.spyOn(api, "search").mockImplementation(async (q, mode) => ({ q, mode, tookMs: 2,
    hits: mode === "hybrid" ? [{ talk, score: 1 }] : [], debug: { query: { match_all: {} } } }));
  render(<MemoryRouter initialEntries={["/search?c=kubecon-na-2026"]}><Search /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Query"), { target: { value: "secure my supply chain" } });
  fireEvent.click(screen.getByLabelText("Include query details"));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await screen.findByText("Comparison ready.");
  expect(search).toHaveBeenCalledWith("secure my supply chain", "keyword", true, {}, "kubecon-na-2026");
  expect(search).toHaveBeenCalledWith("secure my supply chain", "hybrid", true, {}, "kubecon-na-2026");
  expect(within(screen.getByRole("region", { name: "Keyword" })).getByText(/No matching talks/)).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Hybrid" })).getByText(talk.title)).toBeTruthy();
  expect(screen.getAllByText(/match_all/)).toHaveLength(2);
});

it("retains successful results when the other method fails", async () => {
  vi.spyOn(api, "search").mockImplementation(async (q, mode) => {
    if (mode === "keyword") throw new Error("offline");
    return { q, mode, tookMs: 1, hits: [{ talk, score: 1 }] };
  });
  render(<MemoryRouter initialEntries={["/search?c=kubecon-na-2026"]}><Search /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText(talk.title)).toBeTruthy();
});

it("prompts unregistered visitors to register instead of loading a schedule", async () => {
  const get = vi.spyOn(api, "getSchedule");
  render(<MemoryRouter initialEntries={["/schedule?c=kubecon-na-2026"]}><Schedule /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Register now" }).getAttribute("href")).toBe("/site/register.html?c=kubecon-na-2026");
  expect(get).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("prompts to register again when the session token is rejected (401)", async () => {
  setToken("expired-session");
  vi.spyOn(api, "getSchedule").mockRejectedValue(new ApiError("GET /api/schedule failed: 401", 401));
  render(<MemoryRouter initialEntries={["/schedule?c=kubecon-na-2026"]}><Schedule /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Register now" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("renders schedule times, room and recommendation reason and requests a QR", async () => {
  setToken("session");
  vi.spyOn(api, "getSchedule").mockResolvedValue({ items: [{ talk, reason: "Matches your security interests" }], updatedAt: "" });
  const access = vi.spyOn(api, "accessToken").mockResolvedValue({ token: "short-lived", expiresAt: new Date(Date.now() + 60000).toISOString() });
  render(<MemoryRouter initialEntries={["/schedule?c=kubecon-na-2026"]}><Schedule /></MemoryRouter>);
  expect(await screen.findByText(talk.title)).toBeTruthy();
  expect(screen.getByText(/Room A/)).toBeTruthy();
  expect(screen.getByText("Matches your security interests")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Show room QR" }));
  const qr = await screen.findByAltText("Short-lived room check-in QR code");
  expect(access).toHaveBeenCalledOnce();
  expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  fireEvent.click(screen.getByRole("button", { name: "Hide code" }));
  expect(screen.queryByAltText("Short-lived room check-in QR code")).toBeNull();
});

it("asks for a conference instead of querying an event the address does not name", () => {
  const get = vi.spyOn(api, "getSchedule");
  const search = vi.spyOn(api, "search");
  render(<MemoryRouter><Schedule /></MemoryRouter>);
  expect(screen.getByText(/Choose a conference first\./)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open the conference list" }).getAttribute("href")).toBe("/site/#conferences");
  cleanup();
  render(<MemoryRouter><Search /></MemoryRouter>);
  expect(screen.getByText(/Choose a conference first\./)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open the conference list" }).getAttribute("href")).toBe("/site/#conferences");
  expect(get).not.toHaveBeenCalled();
  expect(search).not.toHaveBeenCalled();
});
