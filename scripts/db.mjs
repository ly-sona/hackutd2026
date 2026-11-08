import { cli, endpoint, database, modulePath, bindingsPath, dataDir, localAddress, launch, completed, isDatabaseRunning, configureGateway } from './config.mjs';
import { localSigningKeyArgs } from './local-signing-keys.mjs';
const action = process.argv[2];
let args;
switch (action) {
  case 'start':
    localAddress();
    if (await isDatabaseRunning()) {
      console.log(`Reusing SpacetimeDB at ${endpoint}; no duplicate instance started.`);
      process.exit(0);
    }
    args = ['start', '--listen-addr', localAddress(), '--data-dir', dataDir, ...localSigningKeyArgs(dataDir), '--non-interactive'];
    break;
  case 'build': args = ['build', '--module-path', modulePath]; break;
  case 'publish':
    localAddress();
    await configureGateway();
    args = ['publish', '--no-config', '--server', endpoint, '--module-path', modulePath, '--delete-data=never', '--yes=skip-login', database];
    break;
  case 'generate':
    args = ['generate', '--no-config', '--lang', 'typescript', '--module-path', modulePath, '--out-dir', bindingsPath, '--yes'];
    break;
  default: throw new Error('Expected start, build, publish, or generate.');
}
try { await completed(launch(cli, args)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
