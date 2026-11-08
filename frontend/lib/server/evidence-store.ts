// Node-only private original-byte store. This is not imported by browser components.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve, isAbsolute, sep } from "node:path";
import { AccessError } from "./gateway";
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export function evidenceDigest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function validateEvidence(
  filename: string,
  suppliedType: string,
  bytes: Uint8Array,
) {
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES)
    throw new AccessError(
      "INVALID_INPUT",
      "Evidence must be between 1 byte and 5 MiB.",
    );
  if (filename.length > 180 || /[\x00-\x1f/\\]/.test(filename))
    throw new AccessError(
      "INVALID_INPUT",
      "Use a simple file name without path or control characters.",
    );
  const ext = filename.toLowerCase().split(".").pop();
  const map: Record<string, string> = {
    txt: "text/plain",
    log: "text/plain",
    json: "application/json",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  const type = ext && map[ext];
  if (
    !type ||
    (suppliedType &&
      suppliedType !== type &&
      !(
        ext === "log" &&
        ["application/octet-stream", "text/x-log"].includes(suppliedType)
      ))
  )
    throw new AccessError(
      "INVALID_INPUT",
      "Allowed formats: TXT, LOG, JSON, PDF, PNG, JPEG. File content type must match.",
    );
  const b = Buffer.from(bytes);
  if (type === "text/plain" || type === "application/json") {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new AccessError(
        "INVALID_INPUT",
        "Text evidence must be valid UTF-8.",
      );
    }
    if (text.includes("\0"))
      throw new AccessError(
        "INVALID_INPUT",
        "Binary data is not valid text evidence.",
      );
    if (type === "application/json") {
      try {
        JSON.parse(text);
      } catch {
        throw new AccessError("INVALID_INPUT", "The JSON evidence is invalid.");
      }
    }
  }
  if (type === "application/pdf" && b.subarray(0, 5).toString() !== "%PDF-")
    throw new AccessError("INVALID_INPUT", "Invalid PDF signature.");
  if (
    type === "image/png" &&
    !b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new AccessError("INVALID_INPUT", "Invalid PNG signature.");
  if (type === "image/jpeg" && (b[0] !== 255 || b[1] !== 216 || b[2] !== 255))
    throw new AccessError("INVALID_INPUT", "Invalid JPEG signature.");
  return type;
}
function directory() {
  const dir = process.env.EVIDENCE_STORAGE_DIR;
  if (!dir || !isAbsolute(dir))
    throw new AccessError(
      "UNAVAILABLE",
      "Private evidence storage must be configured with an absolute directory.",
    );
  for (const publicDirectory of [
    resolve(process.cwd(), "public"),
    resolve(process.cwd(), "frontend/public"),
  ]) {
    if (dir === publicDirectory || dir.startsWith(publicDirectory + sep))
      throw new AccessError(
        "UNAVAILABLE",
        "Evidence storage cannot be inside a public asset directory.",
      );
  }
  return dir;
}
function location(reference: string) {
  if (!/^[a-f0-9-]{36}$/.test(reference))
    throw new AccessError(
      "INVALID_INPUT",
      "Invalid evidence storage reference.",
    );
  return resolve(directory(), reference);
}
export async function storeEvidence(
  bytes: Uint8Array,
  reference: string = randomUUID(),
) {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  await writeFile(location(reference), bytes, { flag: "wx", mode: 0o600 });
  return {
    storageReference: reference,
    sha256: evidenceDigest(bytes),
    size: bytes.length,
  };
}
export async function readEvidence(reference: string, digest: string) {
  let bytes: Buffer;
  try {
    bytes = await readFile(location(reference));
  } catch {
    throw new AccessError(
      "NOT_FOUND",
      "Original evidence file is unavailable.",
    );
  }
  if (bytes.length > MAX_EVIDENCE_BYTES || evidenceDigest(bytes) !== digest)
    throw new AccessError(
      "INTEGRITY_FAILURE",
      "Evidence integrity check failed. Original file cannot be served.",
    );
  return bytes;
}
export async function removeEvidence(reference: string) {
  await unlink(location(reference)).catch(() => {});
}
