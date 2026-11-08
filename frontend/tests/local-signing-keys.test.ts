import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localSigningKeyArgs } from "../../scripts/local-signing-keys.mjs";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "aegis-signing-test-")); });
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

test("reuses a database's signing keys across starts", () => {
  const state = join(directory, "state");
  const args = localSigningKeyArgs(state);
  const key = readFileSync(join(state, "id_ecdsa"), "utf8");
  expect(localSigningKeyArgs(state)).toEqual(args);
  expect(readFileSync(join(state, "id_ecdsa"), "utf8")).toBe(key);
});

test("isolates fresh test and development database signers", () => {
  for (const name of ["development", "test"]) localSigningKeyArgs(join(directory, name));
  expect(readFileSync(join(directory, "development/id_ecdsa.pub"), "utf8"))
    .not.toBe(readFileSync(join(directory, "test/id_ecdsa.pub"), "utf8"));
});

function legacyDirectory() {
  const config = join(directory, "global");
  vi.stubEnv(process.platform === "win32" ? "LOCALAPPDATA" : "XDG_CONFIG_HOME", config);
  return join(config, process.platform === "win32" ? "SpacetimeDB/config" : "spacetime");
}

test("preserves the legacy signer when local credentials already exist", () => {
  const legacy = legacyDirectory(), state = join(directory, "state");
  mkdirSync(legacy, { recursive: true }); mkdirSync(state);
  const pair = generateKeyPairSync("ec", {
    namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(join(legacy, "id_ecdsa"), pair.privateKey);
  writeFileSync(join(legacy, "id_ecdsa.pub"), pair.publicKey);
  writeFileSync(join(state, "gateway.json"), "{}");
  localSigningKeyArgs(state);
  expect(readFileSync(join(state, "id_ecdsa.pub"), "utf8")).toBe(pair.publicKey);
  expect(readFileSync(join(state, "id_ecdsa"), "utf8")).toBe(pair.privateKey);
});

test("does not generate a replacement signer for credentials with missing legacy keys", () => {
  legacyDirectory();
  const state = join(directory, "state"); mkdirSync(state);
  writeFileSync(join(state, "cli.toml"), "");
  expect(() => localSigningKeyArgs(state)).toThrow("original signing keys");
  expect(existsSync(join(state, "id_ecdsa"))).toBe(false);
});

test("does not replace an incomplete local signing key pair", () => {
  const state = join(directory, "state"); mkdirSync(state);
  writeFileSync(join(state, "id_ecdsa"), "preserve-existing-key");
  expect(() => localSigningKeyArgs(state)).toThrow("incomplete");
  expect(readFileSync(join(state, "id_ecdsa"), "utf8")).toBe("preserve-existing-key");
});
