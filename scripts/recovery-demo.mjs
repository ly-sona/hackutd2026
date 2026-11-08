import { configureGateway, launch, completed } from "./config.mjs";
const outcome = process.argv
  .find((v) => v.startsWith("--outcome="))
  ?.split("=")[1];
if (!["success", "failure"].includes(outcome))
  throw new Error("Usage: npm run demo:recovery -- --outcome=success|failure");
await configureGateway();
process.env.AEGIS_RECOVERY_DEMO_OUTCOME = outcome;
await completed(
  launch("npm", ["exec", "tsx", "--", "scripts/recovery-demo.ts"]),
);
