// The ticket a visitor already has, rebuilt from this browser: the kept profile (name, role, goal, interests) and a fresh
// check-in token from the session. Pages that revisit a registration show it instead of the sign-up pitch.

import { drawQr } from "./qr.js";
import { fetchAccessToken, sessionToken } from "./companion-api.js";

const PROFILE_KEY = "cc.kept-profile.v1";
const SESSION_EXPIRES_KEY = "cc.token.expiresAt";

function keptProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
}

function addField(dl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  const wrap = document.createElement("div");
  wrap.dataset.field = label.toLowerCase();
  wrap.append(dt, dd);
  dl.append(wrap);
}

/** The session's expiry in short form: the time after which the ticket stops being accepted. */
function formatUntil(iso) {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
}

/**
 * Fills `root` with the visitor's ticket: its `[data-ticket-fields]` list and the QR canvas. Shows `root` and returns true;
 * returns false and leaves `root` alone when this browser has no kept profile or no live session.
 */
export async function showSavedTicket(root, canvasSelector = "[data-ticket-qr]") {
  const profile = keptProfile();
  const dl = root.querySelector("[data-ticket-fields]");
  const canvas = root.querySelector(canvasSelector);
  if (!profile || !dl || !canvas || sessionToken() === null) return false;
  dl.replaceChildren();
  if (profile.name) addField(dl, "Name", profile.name);
  if (profile.role) addField(dl, "Role", profile.role);
  if (profile.goal) addField(dl, "Goal", profile.goal);
  if (Array.isArray(profile.interests) && profile.interests.length) addField(dl, "Interests", profile.interests.join(", "));
  const until = formatUntil(localStorage.getItem(SESSION_EXPIRES_KEY));
  if (until) addField(dl, "Expires", until);
  root.hidden = false;
  refreshQr(canvas);
  return true;
}

/** Draws a check-in token, then draws a new one shortly before it expires, for as long as the session lasts. */
async function refreshQr(canvas) {
  const attendeeToken = sessionToken();
  if (!attendeeToken) return;
  try {
    const next = await fetchAccessToken(attendeeToken);
    drawQr(canvas, next.token, { label: "Your ticket QR code. Scanning it reads your ticket code." });
    canvas.hidden = false;
    const left = Date.parse(next.expiresAt) - Date.now();
    setTimeout(() => refreshQr(canvas), Number.isFinite(left) ? Math.max(1000, left - 10_000) : 30_000);
  } catch {
    setTimeout(() => refreshQr(canvas), 15_000);
  }
}
