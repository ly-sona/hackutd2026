import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import {
  CONNECTOR_VERSION,
  parseSnapshot,
  type ConnectorId,
} from "../../../../shared/investigation";
import { validateEvidence } from "../evidence-store";

// Both the catalog and paths are repository-owned, never request/model supplied.
export async function collectSnapshot(
  connectorId: ConnectorId,
  revision: number,
  root = resolve(
    process.cwd(),
    basename(process.cwd()) === "frontend" ? ".." : ".",
  ),
) {
  const manifest = JSON.parse(
    await readFile(
      resolve(root, "backend/seed/investigation-connectors.json"),
      "utf8",
    ),
  ) as { version: string; connectors: Record<string, string[]> };
  const expected = `mock-evidence/connectors/${connectorId}-${revision}.json`;
  if (
    manifest.version !== CONNECTOR_VERSION ||
    ![0, 1, 2].includes(revision) ||
    manifest.connectors[connectorId]?.[revision] !== expected
  )
    throw new Error("Connector revision is not allowlisted.");
  const bytes = await readFile(resolve(root, expected));
  validateEvidence(
    `${connectorId}-${revision}.json`,
    "application/json",
    bytes,
  );
  const data = parseSnapshot(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    connectorId,
    revision,
  );
  return { bytes, data };
}
