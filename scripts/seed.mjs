import { configureGateway, launch, completed } from './config.mjs';
await configureGateway();
await completed(launch('npm', ['exec', 'tsx', '--', 'scripts/bootstrap.ts']));
