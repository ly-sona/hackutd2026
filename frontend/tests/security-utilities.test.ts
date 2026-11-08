import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
  newToken,
} from "@/lib/server/password";
import { safeReturnPath } from "@/lib/auth-navigation";
import { matrix, permissions } from "../../backend/spacetimedb/src/permissions";

describe("security primitives", () => {
  it("salts password hashes and rejects wrong credentials", async () => {
    const password = newToken();
    const one = await hashPassword(password);
    const two = await hashPassword(password);
    expect(one).not.toBe(two);
    expect(one).not.toContain(password);
    expect(await verifyPassword(password, one)).toBe(true);
    expect(await verifyPassword(newToken(), one)).toBe(false);
  });
  it("generates 256-bit tokens and stores one-way hashes", () => {
    const token = newToken();
    expect(token).toHaveLength(43);
    expect(tokenHash(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(newToken()).not.toBe(token);
  });
  it("keeps redirects local and rejects protocol-relative or backslash paths", () => {
    expect(safeReturnPath("/org/acme/incidents/IR-2041/team")).toContain(
      "/org/acme",
    );
    for (const path of [
      "https://untrusted.example",
      "//untrusted.example",
      "/\\untrusted.example",
      "/organizations\nLocation: bad",
    ])
      expect(safeReturnPath(path)).toBe("/organizations");
  });
  it("grants administrators all permissions while preserving other role limits", () => {
    expect(matrix.administrator).toContain("members:invite");
    expect(matrix.administrator).toEqual(permissions);
    expect(matrix.commander).toContain("operations:approve");
    for (const role of ["analyst", "legal", "operations"] as const)
      expect(matrix[role]).not.toContain("members:edit");
  });
});
