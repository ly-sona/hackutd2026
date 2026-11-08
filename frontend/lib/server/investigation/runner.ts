import { withServiceConnection, unwrap, AccessError } from "../gateway";
import { storeEvidence, readEvidence, evidenceDigest } from "../evidence-store";
import { collectSnapshot } from "./collector";
import { canonical, type ConnectorId } from "../../../../shared/investigation";

interface WorkerSnapshot {
  id: string;
  sourceId: string;
  role: string;
  revision: number;
  storageReference: string;
  status: string;
}
export interface WorkerJob {
  run: {
    id: string;
    leaseToken: string;
    status: string;
    collectionStatus: string;
    sourceIds: string;
    expectedSnapshots: number;
  };
  sources: { id: string; connectorId: ConnectorId; latestSnapshotId: string }[];
  snapshots: WorkerSnapshot[];
}
export async function workerCall<T>(
  action: string,
  data: object = {},
): Promise<T> {
  const token = process.env.SPACETIMEDB_WORKER_TOKEN;
  if (!token)
    throw new Error("Investigation worker credentials are not configured.");
  try {
    return await withServiceConnection(token, async (conn) =>
      unwrap<T>(
        await conn.procedures.investigationWorker({
          action,
          payload: JSON.stringify(data),
        }),
      ),
    );
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(
      "UNAVAILABLE",
      "Worker transport outcome is uncertain; resume from the persisted lease/checkpoints.",
    );
  }
}
// Checkpoints and originals are owned by the DB/private store, never this process.
export async function processJob(
  job: WorkerJob,
  collect: typeof collectSnapshot = collectSnapshot,
) {
  const base = { runId: job.run.id, leaseToken: job.run.leaseToken };
  let sourceId: string | undefined;
  try {
    const roles =
      job.run.expectedSnapshots === job.sources.length
        ? ["current"]
        : ["baseline", "current"];
    for (const source of job.sources)
      for (const role of roles) {
        sourceId = source.id;
        const args = { ...base, sourceId: source.id };
        const snapshot = await workerCall<WorkerSnapshot>("reserve", {
          ...args,
          role,
        });
        if (snapshot.status === "Finalized") continue;
        const { bytes, data } = await collect(
          source.connectorId,
          snapshot.revision,
        );
        const digest = evidenceDigest(bytes);
        try {
          await storeEvidence(bytes, snapshot.storageReference);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          await readEvidence(snapshot.storageReference, digest);
        }
        await workerCall("metadata", {
          ...args,
          snapshotId: snapshot.id,
          sha256: digest,
          size: bytes.length,
          collectedAt: data.collectedAt,
          coverage: data.coverage,
          recordCount: data.records.length,
        });
        // Small batches stay well below the command bound even for maximum field lengths.
        let rows: {
          body: (typeof data.records)[number];
          sha256: string;
          index: number;
        }[] = [];
        for (const [index, body] of data.records.entries()) {
          const row = {
            body,
            sha256: evidenceDigest(Buffer.from(canonical(body))),
            index,
          };
          if (
            rows.length &&
            (rows.length === 20 ||
              JSON.stringify([...rows, row]).length > 24_000)
          ) {
            await workerCall("records", {
              ...args,
              snapshotId: snapshot.id,
              rows,
            });
            rows = [];
          }
          rows.push(row);
        }
        if (rows.length)
          await workerCall("records", {
            ...args,
            snapshotId: snapshot.id,
            rows,
          });
        await readEvidence(snapshot.storageReference, digest);
        await workerCall("finalize", { ...args, snapshotId: snapshot.id });
      }
    for (const source of job.sources) {
      sourceId = source.id;
      await workerCall("analyze", { ...base, sourceId: source.id });
    }
    return true;
  } catch (error) {
    // An unknown transport outcome is resumable, not proof that publication failed.
    if (!(error instanceof AccessError && error.code === "UNAVAILABLE")) {
      await workerCall("fail", {
        ...base,
        sourceId,
        message: `${job.sources.find((source) => source.id === sourceId)?.connectorId ?? "Source"}: snapshot collection or deterministic processing failed. Originals and checkpoints retained; retry with fresh authorization.`,
      }).catch(() => {});
    }
    throw error;
  }
}
export async function processNextJob() {
  const job = await workerCall<WorkerJob | null>("claim");
  if (!job) return false;
  return processJob(job);
}
