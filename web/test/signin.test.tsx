import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/App.js";
import { api, resetProvidersCache, setToken, signOut } from "../src/api.js";

const LINKED_KEY = "cc.linked.v1";
const LINKED = JSON.stringify({ github: { displayName: "Ada Lovelace", handle: "ada", avatarUrl: "", linkedAt: "2026-11-01T00:00:00.000Z" } });

beforeEach(() => { resetProvidersCache(); signOut(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

const renderSchedule = () => render(<MemoryRouter initialEntries={["/schedule"]}><App /></MemoryRouter>);
const providers = (enabled: boolean) => vi.spyOn(api, "authProviders").mockResolvedValue({ providers: [{ id: "github", enabled }] });

it("header offers Sign in with GitHub that returns to the current page", async () => {
  providers(true);
  renderSchedule();
  const link = await within(screen.getByRole("banner")).findByRole("link", { name: "Sign in with GitHub" });
  expect(link.getAttribute("href")).toBe("/api/auth/github/start?return=%2Fschedule");
});

it("header offers Sign in with GitHub for a linked account with no live session", async () => {
  localStorage.setItem(LINKED_KEY, LINKED);
  providers(true);
  renderSchedule();
  const link = await within(screen.getByRole("banner")).findByRole("link", { name: "Sign in with GitHub" });
  expect(link.getAttribute("href")).toBe("/api/auth/github/start?return=%2Fschedule");
});

it("header shows Sign out for a session, and signing out keeps the linked profile", async () => {
  localStorage.setItem(LINKED_KEY, LINKED);
  providers(true);
  vi.spyOn(api, "getSchedule").mockResolvedValue({ items: [], updatedAt: "" });
  setToken("t");
  renderSchedule();
  const header = within(screen.getByRole("banner"));
  await screen.findByRole("heading", { level: 1, name: "My schedule" });
  fireEvent.click(await header.findByRole("button", { name: "Sign out" }));
  await header.findByText("Signed out. Your profile stays in this browser until you sign in again.");
  expect(localStorage.getItem("cc.token")).toBeNull();
  expect(JSON.parse(localStorage.getItem(LINKED_KEY)!)).toHaveProperty("github.linkedAt");
  await header.findByRole("link", { name: "Sign in with GitHub" });
});

it("header hides the account control when GitHub is not enabled", async () => {
  const fetched = providers(false);
  renderSchedule();
  await waitFor(() => expect(fetched).toHaveBeenCalled());
  await Promise.resolve();
  expect(screen.queryByRole("link", { name: "Sign in with GitHub" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

it("a chat session shows only Sign out in the header; GitHub is linked from the profile page", async () => {
  providers(true);
  vi.spyOn(api, "getSchedule").mockResolvedValue({ items: [], updatedAt: "" });
  setToken("chat-token", "2999-01-01T00:00:00.000Z"); // no provider: a chat registration
  renderSchedule();
  const header = within(screen.getByRole("banner"));
  await header.findByRole("button", { name: "Sign out" });
  expect(header.queryByRole("link", { name: /Sign in/ })).toBeNull();
});

it("a GitHub session shows only Sign out", async () => {
  providers(true);
  vi.spyOn(api, "getSchedule").mockResolvedValue({ items: [], updatedAt: "" });
  setToken("gh-token", "2999-01-01T00:00:00.000Z", "github");
  renderSchedule();
  const header = within(screen.getByRole("banner"));
  await header.findByRole("button", { name: "Sign out" });
  expect(header.queryByRole("link", { name: /Sign in/ })).toBeNull();
});
