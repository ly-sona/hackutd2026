import { command } from "../frontend/lib/server/gateway";
console.log(
  await command("recovery.demo.profile", "", {
    organizationId: "acme",
    incidentId: "IR-2041",
    profile: process.env.AEGIS_RECOVERY_DEMO_OUTCOME,
  }),
);
console.log(
  "Only future primary executions use this synthetic outcome. Existing executions and evidence are preserved.",
);
