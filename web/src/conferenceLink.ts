import { isConferenceSlug } from "@cc/shared";

/**
 * An in-app link target with the current address's `?c=` conference carried over.
 * The target keeps its own query and hash; an address without a valid slug leaves it unchanged,
 * so a page opened without a conference still renders its chooser instead of a link with `c=null`.
 */
export function withConference(path: string, search: string): string {
  const slug = new URLSearchParams(search).get("c");
  if (!isConferenceSlug(slug)) return path;
  const url = new URL(path, "http://x.invalid");
  url.searchParams.set("c", slug);
  return `${url.pathname}${url.search}${url.hash}`;
}
