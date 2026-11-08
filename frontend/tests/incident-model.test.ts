import { describe, it, expect } from "vitest";
import {
  isUnread,
  unresolved,
  sortEvents,
  highlightExcerpt,
  incidentTime,
  type Finding,
  type IncidentEvent,
} from "../lib/incident-model";
const finding = { id: "f", status: "Suspected", updatedAt: "200" } as Finding;
describe("readable incident times", () => {
  it("uses a named date and 12-hour clock in the incident time zone", () => {
    const timestamp = Date.parse("2026-11-08T20:30:00Z");
    expect(incidentTime(String(timestamp))).toBe("Nov 8, 2026 at 2:30 PM CST");
    expect(incidentTime(timestamp, false)).toBe("2:30 PM CST");
    expect(incidentTime(Date.parse("2026-07-08T19:30:00Z"), false)).toBe("2:30 PM CDT");
  });
  it("distinguishes midnight from noon", () => {
    expect(incidentTime(Date.parse("2026-01-15T06:00:00Z"), false)).toBe("12:00 AM CST");
    expect(incidentTime(Date.parse("2026-01-15T18:00:00Z"), false)).toBe("12:00 PM CST");
  });
  it("handles missing and invalid timestamps without breaking the page", () => {
    for (const timestamp of ["", "0", "invalid", Infinity, 1e20])
      expect(incidentTime(timestamp)).toBe("Not provided");
  });
});

describe("incident investigation and personal attention", () => {
  it("reading a finding changes new state without resolving its investigation", () => {
    expect(isUnread(finding, [])).toBe(true);
    expect(
      isUnread(finding, [{ id: "r", findingId: "f", readAt: "200" }]),
    ).toBe(false);
    expect(unresolved(finding)).toBe(true);
    expect(
      isUnread({ ...finding, updatedAt: "201" }, [
        { id: "r", findingId: "f", readAt: "200" },
      ]),
    ).toBe(true);
  });
  it("only resolved and ruled-out findings leave the unresolved set", () => {
    for (const status of ["Unverified", "Suspected", "Confirmed"])
      expect(unresolved({ ...finding, status })).toBe(true);
    for (const status of ["Resolved", "Ruled Out"])
      expect(unresolved({ ...finding, status })).toBe(false);
  });
  it("uses event IDs to break timestamp ties without mutating history", () => {
    const events = [
      { id: "2", createdAt: "100" },
      { id: "11", createdAt: "100" },
      { id: "3", createdAt: "99" },
    ] as IncidentEvent[];
    expect(sortEvents(events).map((e) => e.id)).toEqual(["11", "2", "3"]);
    expect(events[0].id).toBe("2");
  });
  it("highlights literal excerpts without treating text as markup or a regex", () => {
    expect(highlightExcerpt("<script>alert(1)</script> [a]", "[a]")).toEqual([
      "<script>alert(1)</script> ",
      "[a]",
      "",
    ]);
    expect(highlightExcerpt("plain", "missing")).toEqual(["plain"]);
  });
});
