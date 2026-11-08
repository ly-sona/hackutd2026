import { existsSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, constants } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";

export function localSigningKeyArgs(directory) {
  const privatePath = resolve(directory, "id_ecdsa");
  const publicPath = resolve(directory, "id_ecdsa.pub");
  const hasPrivate = existsSync(privatePath), hasPublic = existsSync(publicPath);
  if (hasPrivate !== hasPublic)
    throw new Error("Local signing key pair is incomplete. Restore its missing file; existing keys were not replaced.");
  if (!hasPrivate) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const legacy = process.platform === "win32"
      ? resolve(process.env.LOCALAPPDATA, "SpacetimeDB/config")
      : resolve(process.env.XDG_CONFIG_HOME ?? resolve(homedir(), ".config"), "spacetime");
    const hasCredentials = existsSync(resolve(directory, "gateway.json")) || existsSync(resolve(directory, "cli.toml"));
    if (hasCredentials) {
      if (!existsSync(resolve(legacy, "id_ecdsa")) || !existsSync(resolve(legacy, "id_ecdsa.pub")))
        throw new Error("Existing local credentials require their original signing keys. Restore the key pair before starting; no replacement was generated.");
      // Preserve the prior signer when upgrading an existing local database.
      copyFileSync(resolve(legacy, "id_ecdsa"), privatePath, constants.COPYFILE_EXCL);
      copyFileSync(resolve(legacy, "id_ecdsa.pub"), publicPath, constants.COPYFILE_EXCL);
      chmodSync(privatePath, 0o600);
      chmodSync(publicPath, 0o600);
    } else {
      const { privateKey, publicKey } = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
      });
      writeFileSync(privatePath, privateKey, { flag: "wx", mode: 0o600 });
      writeFileSync(publicPath, publicKey, { flag: "wx", mode: 0o600 });
    }
  }
  return ["--jwt-priv-key-path", privatePath, "--jwt-pub-key-path", publicPath];
}
