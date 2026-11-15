import { SUGGEST_PATH, type Suggestion, type SuggestResponse } from "@cc/shared";

/**
 * Public endpoint (no session token). Pass a signal so a newer keystroke can cancel the request.
 * Suggestions are scoped to a conference, so without a slug there is nothing to look up.
 */
export async function fetchSuggestions(q: string, signal?: AbortSignal, conference?: string | null): Promise<Suggestion[]> {
  if (!conference) return [];
  const res = await fetch(`${SUGGEST_PATH}?${new URLSearchParams({ q, conference })}`, { signal });
  if (!res.ok) throw new Error(`suggest failed: ${res.status}`);
  return ((await res.json()) as SuggestResponse).suggestions;
}
