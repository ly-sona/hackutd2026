import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataDir } from './config.mjs';
console.log('Local synthetic accounts — private development credentials. Do not share logs.');
console.table(JSON.parse(readFileSync(resolve(dataDir, 'demo-accounts.json'), 'utf8')));
