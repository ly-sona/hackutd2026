import { copyFileSync, existsSync } from "node:fs";
const target = new URL("../frontend/.env.local", import.meta.url);
if (!existsSync(target)) {
  copyFileSync(new URL("../frontend/.env.example", import.meta.url), target);
  console.log("Created frontend/.env.local with local development defaults.");
}

// CLI 2.14 checks only module-local node_modules/.bin/tsc; npm workspaces hoist it.
// Link the workspace compiler so CLI builds keep their normal type-check step.
const { mkdirSync, symlinkSync, writeFileSync } = await import('node:fs');
const { createRequire } = await import('node:module');
const { dirname, relative } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const compiler = createRequire(new URL('../backend/spacetimedb/package.json', import.meta.url)).resolve('typescript/bin/tsc');
const bin = fileURLToPath(new URL('../backend/spacetimedb/node_modules/.bin/tsc', import.meta.url));
mkdirSync(dirname(bin), { recursive: true });
if (process.platform === 'win32') {
  writeFileSync(`${bin}.cmd`, `@node "${compiler}" %*\r\n`);
} else if (!existsSync(bin)) {
  symlinkSync(relative(dirname(bin), compiler), bin);
}
