// Next.js replaces these public values at build time. No credentials belong here.
export const spacetimeConfig = {
  endpoint: process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? 'http://127.0.0.1:3001',
  database: process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME ?? 'aegis-local',
};
