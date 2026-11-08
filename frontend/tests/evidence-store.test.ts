// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateEvidence,
  evidenceDigest,
  storeEvidence,
  readEvidence,
  MAX_EVIDENCE_BYTES,
} from "../lib/server/evidence-store";
const directories: string[] = [];
afterEach(async () => {
  for (const d of directories) await rm(d, { recursive: true, force: true });
  directories.length = 0;
  delete process.env.EVIDENCE_STORAGE_DIR;
});
describe("untrusted evidence originals", () => {
  it("rejects a public asset directory for original evidence", async () => {
    process.env.EVIDENCE_STORAGE_DIR = join(
      process.cwd(),
      "public",
      "evidence",
    );
    await expect(storeEvidence(Buffer.from("private"))).rejects.toThrow(
      "public asset",
    );
  });
  it("validates bounded formats and rejects disguised, binary, oversized and malformed content", () => {
    const text = new TextEncoder().encode("<script>alert(1)</script>");
    expect(validateEvidence("note.txt", "text/plain", text)).toBe("text/plain");
    for (const [name, type, bytes] of [
      ["attack.html", "text/html", text],
      ["fake.png", "image/png", text],
      ["broken.json", "application/json", text],
      ["binary.txt", "text/plain", new Uint8Array([0, 1])],
      ["bad.pdf", "application/pdf", text],
      ["large.txt", "text/plain", new Uint8Array(MAX_EVIDENCE_BYTES + 1)],
    ] as const)
      expect(() => validateEvidence(name, type, bytes)).toThrow();
  });
  it("preserves original bytes, refuses overwrite and detects tampering", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aegis-evidence-"));
    directories.push(dir);
    process.env.EVIDENCE_STORAGE_DIR = dir;
    const bytes = Buffer.from("synthetic evidence\r\n");
    const stored = await storeEvidence(bytes);
    expect(evidenceDigest(bytes)).toBe(stored.sha256);
    expect(await readEvidence(stored.storageReference, stored.sha256)).toEqual(
      bytes,
    );
    expect(await readFile(join(dir, stored.storageReference))).toEqual(bytes);
    await expect(
      storeEvidence(Buffer.from("changed"), stored.storageReference),
    ).rejects.toThrow();
    await writeFile(join(dir, stored.storageReference), "tampered");
    await expect(
      readEvidence(stored.storageReference, stored.sha256),
    ).rejects.toThrow("integrity");
  });
});
