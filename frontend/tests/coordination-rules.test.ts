import { describe, it, expect } from "vitest";
import {
  canTransition,
  orderMessages,
  attentionCount,
  pageAckSeconds,
} from "../../shared/coordination";
import { matrix } from "../../backend/spacetimedb/src/permissions";
describe("coordination rules", () => {
  it("requires a verification step before completion and allows an explicit reopen", () => {
    expect(canTransition("Open", "Completed")).toBe(false);
    expect(canTransition("In Progress", "Completed")).toBe(false);
    expect(canTransition("Awaiting Verification", "Completed")).toBe(true);
    expect(canTransition("Completed", "In Progress")).toBe(true);
    expect(canTransition("Canceled", "Open")).toBe(true);
  });
  it("orders simultaneous messages by numeric server IDs", () => {
    expect(
      orderMessages([
        { id: "10", createdAt: "500" },
        { id: "2", createdAt: "500" },
        { id: "12", createdAt: "499" },
      ]).map((m) => m.id),
    ).toEqual(["12", "2", "10"]);
  });
  it("counts a linked task and unresolved finding as one work item", () => {
    expect(
      attentionCount(
        [
          { id: "t", status: "Open", relatedFindingId: "f" },
          { id: "done", status: "Completed", relatedFindingId: "f2" },
        ],
        [
          { id: "f", status: "Suspected" },
          { id: "f2", status: "Unverified" },
          { id: "f3", status: "Resolved" },
        ],
      ),
    ).toBe(2);
  });
  it("keeps production deadlines at five minutes and bounds development overrides", () => {
    expect(pageAckSeconds(false, "5")).toBe(300);
    expect(pageAckSeconds(true, "5")).toBe(5);
    for (const invalid of ["0", "-10", "Infinity", "abc", "2.5", "301"])
      expect(pageAckSeconds(true, invalid)).toBe(300);
  });
  it("grants administrators incident chat, tasks and paging", () => {
    expect(matrix.administrator).toContain("messages:view");
    expect(matrix.administrator).toContain("tasks:view");
    expect(matrix.administrator).toContain("pages:create");
    expect(matrix.commander).toContain("pages:create");
    expect(matrix.legal).toContain("pages:acknowledge");
    expect(matrix.operations).not.toContain("tasks:assign");
  });
});
