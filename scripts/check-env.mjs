import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, cli, endpoint, database, localAddress, isDatabaseRunning } from './config.mjs';
const [major, minor, patch] = process.versions.node.split('.').map(Number);
if (!((major === 24 && (minor > 22 || (minor === 22 && patch >= 1))) || (major === 22 && (minor > 23 || (minor === 23 && patch >= 4))))) {
  throw new Error('Use Node 24.22.1+ (24 LTS) or 22.23.4+ (22 LTS), as required by SpacetimeDB 2.14.1.');
}
console.log(`Node ${process.version}; npm ${execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()}`);
try {
  const version = execFileSync(cli, ['--version'], { encoding: 'utf8' }).trim();
  console.log(version);
  if (!version.includes('tool version 2.14.1;')) throw new Error('Use CLI 2.14.1 to match the pinned SDK.');
}
catch (error) { throw new Error(`CLI check failed: ${error.message}. Install spacetime 2.14.1 or set SPACETIME_CLI; see README.`); }
localAddress();
console.log(`Database: ${endpoint} / ${database}`);
console.log(`Local server: ${await isDatabaseRunning() ? 'running' : 'offline (npm run dev starts it)'}`);
if (!existsSync(resolve(root, 'frontend/.env.local'))) throw new Error('Run npm install to create frontend/.env.local.');
if (!existsSync(resolve(root, 'frontend/src/module_bindings/index.ts'))) throw new Error('Run npm run db:generate.');
console.log('Environment ready. npm run dev provisions private local service credentials and seeds independent accounts; no Photon credentials are required.');
