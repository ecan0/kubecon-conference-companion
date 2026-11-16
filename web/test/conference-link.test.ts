import { expect, it } from "vitest";
import { withConference } from "../src/conferenceLink.js";

it("adds the address's conference to an in-app path", () => {
  expect(withConference("/talks/a", "?c=kubecon-na-2026")).toBe("/talks/a?c=kubecon-na-2026");
  expect(withConference("/talks/a", "?q=security&c=pycon-us-2027")).toBe("/talks/a?c=pycon-us-2027");
});

it("keeps the target path's own query and hash", () => {
  expect(withConference("/search?q=kubernetes#results", "?c=pycon-us-2027"))
    .toBe("/search?q=kubernetes&c=pycon-us-2027#results");
  expect(withConference("/schedule?c=stale", "?c=pycon-us-2027")).toBe("/schedule?c=pycon-us-2027");
});

it("leaves a target alone when the address names no valid conference", () => {
  expect(withConference("/talks/a", "")).toBe("/talks/a");
  expect(withConference("/talks/a?from=search#abstract", "?q=security")).toBe("/talks/a?from=search#abstract");
  expect(withConference("/talks/a", "?c=Not%20A%20Slug")).toBe("/talks/a");
  expect(withConference("/talks/a", "?c=")).toBe("/talks/a");
});
