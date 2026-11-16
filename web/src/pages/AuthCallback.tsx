import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import type { AuthCallbackResponse } from "@cc/shared";
import { ApiError, api, getToken, setSessionVia, setToken } from "../api.js";
import { siteNavigation } from "../App.js";
import { ErrorState, LoadingState } from "../components/PageState.js";

const LINKED_KEY = "cc.linked.v1";
const PROFILE_PATH = "/site/profile.html";
const CLAIM_KEY = "cc.identity-claim";

/** Merges the provider display profile into browser localStorage; server identity linking uses only an HMAC. */
export function storeLinked(r: AuthCallbackResponse): void {
  try {
    const raw = localStorage.getItem(LINKED_KEY);
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const base = current && typeof current === "object" && !Array.isArray(current) ? current : {};
    localStorage.setItem(LINKED_KEY, JSON.stringify({
      ...base,
      [r.provider]: { displayName: r.displayName, handle: r.handle, avatarUrl: r.avatarUrl, linkedAt: new Date().toISOString() },
    }));
  } catch {
    // storage unavailable or corrupt: the visitor can still carry on without the link being remembered
  }
}

// The state is one-time: under React StrictMode the effect runs twice, so both runs share one request.
const inFlight = new Map<string, Promise<AuthCallbackResponse>>();
function postCallbackOnce(provider: string, code: string, state: string): Promise<AuthCallbackResponse> {
  const key = `${provider}\n${state}`;
  let p = inFlight.get(key);
  if (!p) {
    p = api.authCallback(provider, { code, state });
    inFlight.set(key, p);
    const forget = () => { if (inFlight.get(key) === p) inFlight.delete(key); };
    p.then(forget, forget);
  }
  return p;
}

/**
 * Where a new account (a registration claim, no session) goes after sign-in: registration, wherever the
 * sign-in started. A return path already on the register page keeps its query; any other return path
 * still contributes its `c` conference. `via` names the provider.
 */
function claimTarget(provider: string, ret: string): string {
  const onRegister = ret.startsWith("/site/register.html");
  const url = onRegister ? new URL(ret, "http://x.invalid") : new URL("/site/register.html", "http://x.invalid");
  if (!onRegister) {
    const conference = new URL(ret, "http://x.invalid").searchParams.get("c");
    if (conference) url.searchParams.set("c", conference);
  }
  url.searchParams.set("via", provider);
  return url.pathname + url.search;
}

/**
 * OAuth callback target. Exchanges the code, stores the returned session or short-lived registration claim,
 * and resumes at the validated return path.
 */
export function AuthCallback() {
  const { provider = "" } = useParams();
  const { search } = useLocation();
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [appLink, setAppLink] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(search);
    const code = q.get("code");
    const state = q.get("state");
    if (q.get("error") || !code || !state) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const linked = await postCallbackOnce(provider, code, state);
        if (linked.claim && !linked.session && getToken() !== null) {
          // A new account while this browser already holds a session (a chat registration): link the account to that
          // registration rather than starting a second one. From here the session counts as a GitHub session.
          await api.linkIdentity(linked.claim.token);
          storeLinked(linked);
          setSessionVia(linked.provider);
          if (!cancelled) siteNavigation.replace(linked.return);
          return;
        }
        if (linked.session) {
          setToken(linked.session.token, linked.session.expiresAt, linked.provider);
          try { sessionStorage.removeItem(CLAIM_KEY); } catch { /* no browser storage */ }
        }
        if (linked.claim) {
          try { sessionStorage.setItem(CLAIM_KEY, JSON.stringify(linked.claim)); } catch { /* registration can still proceed without link */ }
        }
        storeLinked(linked);
        if (linked.app) {
          const url = `confcompanion://linked?provider=${encodeURIComponent(linked.provider)}&name=${encodeURIComponent(linked.displayName)}`;
          setAppLink(url);
          siteNavigation.replace(url);
        } else {
          siteNavigation.replace(linked.claim && !linked.session ? claimTarget(linked.provider, linked.return) : linked.return);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 409) setConflict(true);
        else setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [provider, search]);

  if (conflict) {
    return <ErrorState>
      This GitHub account already has a profile, so it was not linked to this registration. Sign out, then sign in with GitHub to use that profile. <a href={PROFILE_PATH}>Back to your profile</a>
    </ErrorState>;
  }
  if (failed) {
    return <ErrorState>
      We could not link that account. <a href={PROFILE_PATH}>Back to your profile</a>
    </ErrorState>;
  }
  if (appLink) return <p role="status">Account linked. <a href={PROFILE_PATH}>Back to your profile</a></p>;
  return <LoadingState>Linking your account…</LoadingState>;
}
