import { configureGateway, launch, completed } from './config.mjs';
await configureGateway();
await completed(launch('npm', ['run', 'dev', '--workspace', '@aegis/frontend']));
