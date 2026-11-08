import { configureGateway, completed, launch } from './config.mjs';
if (!process.argv.includes('--confirm-disposable-demo')) throw new Error('Pass --confirm-disposable-demo to reset ONLY IR-2043 read/visit state; incident records, files and accounts remain untouched.');
await configureGateway();
await completed(launch('npm',['exec','tsx','--','scripts/reset-demo.ts',...process.argv.slice(2)]));
