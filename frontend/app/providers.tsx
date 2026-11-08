'use client';

import { useMemo } from 'react';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from '@/src/module_bindings';
import { spacetimeConfig } from '@/lib/spacetime-config';

export function Providers({ children }: { children: React.ReactNode }) {
  // Anonymous SDK identity is transport plumbing, not an authenticated AEGIS user.
  // Phase 0 needs no stored token or corporate identity provider.
  const connectionBuilder = useMemo(() => DbConnection.builder()
    .withUri(spacetimeConfig.endpoint)
    .withDatabaseName(spacetimeConfig.database), []);
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}>{children}</SpacetimeDBProvider>;
}
