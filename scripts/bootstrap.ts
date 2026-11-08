import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { command } from "../frontend/lib/server/gateway";
import {
  hashPassword,
  newToken,
  tokenHash,
} from "../frontend/lib/server/password";

const directory = resolve(
  process.cwd(),
  process.env.SPACETIMEDB_DATA_DIR ?? ".spacetime/data",
);
const file = resolve(directory, "demo-accounts.json");
const profiles = [
  { id: "maya", name: "Maya Chen", login: "maya.chen", role: "commander" },
  { id: "alex", name: "Alex Rivera", login: "alex.rivera", role: "analyst" },
  { id: "priya", name: "Priya Shah", login: "priya.shah", role: "legal" },
  {
    id: "jordan",
    name: "Jordan Davis",
    login: "jordan.davis",
    role: "operations",
  },
  {
    id: "taylor",
    name: "Taylor Morgan",
    login: "taylor.morgan",
    role: "analyst",
  },
  { id: "sam", name: "Sam Patel", login: "sam.patel", role: "administrator" },
];
const stored = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as {
      login: string;
      password: string;
    }[])
  : [];
const accounts = profiles.map((p) => ({
  ...p,
  password:
    stored.find((a) => a.login === p.login)?.password ??
    process.env.AEGIS_DEMO_PASSWORD ??
    newToken(),
}));
const users = await Promise.all(
  accounts.map(async ({ password, ...profile }) => ({
    ...profile,
    passwordHash: await hashPassword(password),
  })),
);
const result = await command<{ seeded: boolean }>("bootstrap", "", {
  users,
  invitationHash0: tokenHash(newToken()),
  invitationHash1: tokenHash(newToken()),
  invitationHash2: tokenHash(newToken()),
  eventId: randomUUID(),
});
if (result.seeded) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  console.log(`Seeded six synthetic responders. Private credentials: ${file}`);
} else
  console.log("Existing access data preserved; bootstrap is already complete.");
