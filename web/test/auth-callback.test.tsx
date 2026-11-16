import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { App, siteNavigation } from "../src/App.js";
import { signOut } from "../src/api.js";

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
// The site header also asks /api/auth/providers for its sign-in button; only the callback gets the scripted answer.
const isCallback = (url: string) => url.includes("/api/auth/") && url.endsWith("/callback");
const reply = (status: number, body: unknown) => vi.fn(async (url: string) => isCallback(url)
  ? new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  : new Response("{}", { status: 503 }));
const authCalls = (m: ReturnType<typeof reply>) => m.mock.calls.filter((c) => isCallback(String(c[0]))) as unknown as [string, RequestInit][];

let sessionData: Map<string, string>;
beforeEach(() => {
  signOut(); // the module keeps the live token in memory: a test must not inherit the previous one's session
  // A Map-backed stand-in: the runtime's own localStorage global is not reliable under jsdom here.
  const data = new Map<string, string>();
  sessionData = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  });
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => sessionData.get(k) ?? null,
    setItem: (k: string, v: string) => { sessionData.set(k, v); },
    removeItem: (k: string) => { sessionData.delete(k); },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("/auth/:provider/callback", () => {
  it("posts code and state, replaces the linked account for this provider and goes back to the return path", async () => {
    localStorage.setItem("cc.linked.v1", JSON.stringify({ github: { displayName: "Ada", linkedAt: "2026-01-01T00:00:00.000Z" } }));
    const fetchMock = reply(200, { provider: "github", displayName: "Grace Hopper", handle: "ghopper", avatarUrl: "https://a.example/x.png", return: "/site/profile.html", app: false, session: { token: "session-token", expiresAt: "2026-11-11T20:00:00.000Z" } });
    vi.stubGlobal("fetch", fetchMock);
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=xyz");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/site/profile.html"));
    const [url, init] = authCalls(fetchMock)[0]!;
    expect(url).toBe("/api/auth/github/callback");
    expect(JSON.parse(init.body as string)).toEqual({ code: "abc", state: "xyz" });
    const stored = JSON.parse(localStorage.getItem("cc.linked.v1")!);
        expect(stored.github).toMatchObject({ displayName: "Grace Hopper", handle: "ghopper", avatarUrl: "https://a.example/x.png" });
    expect(Number.isNaN(Date.parse(stored.github.linkedAt))).toBe(false);
  });

  it("stores a new identity claim and sends a default profile return to registration", async () => {
    vi.stubGlobal("fetch", reply(200, { provider: "github", displayName: "Grace", return: "/site/profile.html", app: false, claim: { token: "identity-claim-token", expiresAt: "2026-11-11T12:15:00.000Z" } }));
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=claim");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/site/register.html?via=github"));
    expect(sessionStorage.getItem("cc.identity-claim")).toBe(JSON.stringify({ token: "identity-claim-token", expiresAt: "2026-11-11T12:15:00.000Z" }));
  });

  it("sends a new account to registration from any starting page", async () => {
    vi.stubGlobal("fetch", reply(200, { provider: "github", displayName: "Grace", return: "/schedule", app: false, claim: { token: "claim", expiresAt: "2026-11-11T12:15:00.000Z" } }));
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=claim-schedule");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/site/register.html?via=github"));
  });

  it("keeps the conference when a new account started on its registration page", async () => {
    vi.stubGlobal("fetch", reply(200, { provider: "github", displayName: "Grace", return: "/site/register.html?c=kubecon-na-2026&via=github", app: false, claim: { token: "claim", expiresAt: "2026-11-11T12:15:00.000Z" } }));
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=claim-register");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/site/register.html?c=kubecon-na-2026&via=github"));
  });

  it("carries the conference of the page a new account started from into registration", async () => {
    vi.stubGlobal("fetch", reply(200, { provider: "github", displayName: "Grace", return: "/site/conference.html?c=pycon-us-2027", app: false, claim: { token: "claim", expiresAt: "2026-11-11T12:15:00.000Z" } }));
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=claim-conference");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/site/register.html?c=pycon-us-2027&via=github"));
  });

  it("stores a returning attendee session token and follows the requested path", async () => {
    vi.stubGlobal("fetch", reply(200, { provider: "github", displayName: "Ada", return: "/schedule", app: false, session: { token: "attendee-session", expiresAt: "2026-11-11T20:00:00.000Z" } }));
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=session");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/schedule"));
    expect(localStorage.getItem("cc.token")).toBe("attendee-session");
    expect(localStorage.getItem("cc.token.expiresAt")).toBe("2026-11-11T20:00:00.000Z");
  });

  it("posts the one-time state only once under StrictMode", async () => {
    const fetchMock = reply(200, { provider: "github", displayName: "Grace", return: "/site/profile.html", app: false, session: { token: "strict-token", expiresAt: "2026-11-11T20:00:00.000Z" } });
    vi.stubGlobal("fetch", fetchMock);
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    render(<StrictMode><MemoryRouter initialEntries={["/auth/github/callback?code=abc&state=strict1"]}><App /></MemoryRouter></StrictMode>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/site/profile.html"));
    expect(authCalls(fetchMock)).toHaveLength(1);
    expect(localStorage.getItem("cc.linked.v1")).toContain("github");
  });

  it("finishes in the native app when the flow began there, and keeps a fallback link", async () => {
    vi.stubGlobal("fetch", reply(200, { provider: "github", displayName: "Ada L", return: "/site/profile.html", app: true, claim: { token: "native-claim", expiresAt: "2026-11-11T12:15:00.000Z" } }));
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=xyz");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("confcompanion://linked?provider=github&name=Ada%20L"));
    expect(screen.getByRole("link", { name: "Back to your profile" }).getAttribute("href")).toBe("/site/profile.html");
  });

  it.each([
    ["the provider sent an error", "/auth/github/callback?error=access_denied&state=xyz", null],
    ["the code is missing", "/auth/github/callback?state=xyz", null],
    ["the API refuses", "/auth/github/callback?code=abc&state=xyz", 400],
  ])("shows a plain message and a way back when %s", async (_n, path, status) => {
    const fetchMock = reply(status ?? 200, { error: "invalid_state" });
    vi.stubGlobal("fetch", fetchMock);
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt(path);
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not link/i);
    expect(screen.getByRole("link", { name: "Back to your profile" }).getAttribute("href")).toBe("/site/profile.html");
    expect(replace).not.toHaveBeenCalled();
    expect(localStorage.getItem("cc.linked.v1")).toBeNull();
    if (status === null) expect(authCalls(fetchMock)).toHaveLength(0);
  });

  it("links a new account to the chat session in this browser, not a second registration", async () => {
    localStorage.setItem("cc.token", "chat-token");
    localStorage.setItem("cc.token.expiresAt", "2999-01-01T00:00:00.000Z");
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (isCallback(url)) return new Response(JSON.stringify({ provider: "github", displayName: "Grace", handle: "g", avatarUrl: "", return: "/schedule?c=aws-reinvent-2026", app: false, claim: { token: "claim.jwt", expiresAt: "2999-01-01T00:00:00.000Z" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url === "/api/me/identity") return new Response(null, { status: 204 });
      return new Response("{}", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=xyz");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/schedule?c=aws-reinvent-2026"));
    const link = fetchMock.mock.calls.find((c) => c[0] === "/api/me/identity");
    expect(link).toBeTruthy();
    expect((link![1] as RequestInit).headers).toMatchObject({ authorization: "Bearer chat-token" });
    expect(JSON.parse((link![1] as RequestInit).body as string)).toEqual({ identityClaim: "claim.jwt" });
    expect(localStorage.getItem("cc.token.via")).toBe("github");
    expect(localStorage.getItem("cc.token")).toBe("chat-token");
    expect(sessionStorage.getItem("cc.identity-claim")).toBeNull();
  });

  it("says so when the account already has a profile (409), instead of registering it again", async () => {
    localStorage.setItem("cc.token", "chat-token");
    localStorage.setItem("cc.token.expiresAt", "2999-01-01T00:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (isCallback(url)) return new Response(JSON.stringify({ provider: "github", displayName: "Grace", handle: "g", avatarUrl: "", return: "/schedule", app: false, claim: { token: "claim.jwt", expiresAt: "2999-01-01T00:00:00.000Z" } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ error: "identity_linked" }), { status: 409, headers: { "content-type": "application/json" } });
    }));
    const replace = vi.spyOn(siteNavigation, "replace").mockImplementation(() => {});
    renderAt("/auth/github/callback?code=abc&state=xyz");
    expect((await screen.findByRole("alert")).textContent).toMatch(/already has a profile/);
    expect(replace).not.toHaveBeenCalled();
  });
});
