import { command } from "../frontend/lib/server/gateway";
if (!process.argv.includes("--confirm-disposable-demo"))
  throw new Error(
    "Opt in with --confirm-disposable-demo. This resets ONLY IR-2043 per-user read/visit state. All records, files, history and Phase 1 accounts remain intact.",
  );
console.log(
  "Resetting only disposable IR-2043 read/visit state. No incident data or original files will be deleted.",
);
console.log(
  await command("incident.reset", "", {
    incidentId: "IR-2043",
    confirm: "RESET DISPOSABLE DEMO READ STATE",
  }),
);
