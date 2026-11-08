import { processNextJob } from "../frontend/lib/server/investigation/runner";
// The supervisor supplies only the worker credential, not the application gateway token.
delete process.env.SPACETIMEDB_SERVER_TOKEN;
delete process.env.AEGIS_GATEWAY_IDENTITY;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
  });
do {
  try {
    await processNextJob();
  } catch {
    console.error(
      "Investigation worker attempt interrupted; persisted jobs remain recoverable.",
    );
  }
  if (process.argv.includes("--once")) break;
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 750));
} while (!stopping);
