'use client';

import { useState, type FormEvent } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { ArrowUpRight, Radio } from 'lucide-react';
import { tables, reducers } from '@/src/module_bindings';
import { connectionStatus } from '@/lib/connection-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function HealthCheck() {
  const connection = useSpacetimeDB();
  const status = connectionStatus(connection);
  const [rows, isReady] = useTable(tables.healthCheck);
  const writeHealthCheck = useReducer(reducers.writeHealthCheck);
  const [message, setMessage] = useState('AEGIS local connection verified');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const connected = status === 'Connected';
  const recent = [...rows].sort((a, b) => a.id > b.id ? -1 : 1).slice(0, 5);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected || !isReady || !message.trim() || pending) return;
    setPending(true);
    setError(undefined);
    try { await writeHealthCheck({ message: message.trim() }); }
    catch { setError('The health check could not be written. Check the connection and try again.'); }
    finally { setPending(false); }
  }

  return <Card className="gap-0 border-border bg-card shadow-none">
    <CardHeader className="gap-3 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium"><Radio size={16} className="text-muted-foreground" /> Local backend</CardTitle>
        <Badge variant="outline" role="status" aria-label="Backend connection" data-testid="connection-status" className="gap-2 font-normal">
          <span aria-hidden className={`size-1.5 rounded-full ${connected ? 'bg-emerald-400' : status === 'Connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />{status}
        </Badge>
      </div>
      <CardDescription>Write a test record and watch it arrive through a live subscription.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6 pt-6">
      {!connected && <p className="text-sm text-muted-foreground">{status === 'Connecting' ? 'Establishing the local database connection…' : 'Backend unavailable. Start the local services; the SDK will retry the connection.'}</p>}
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="health-message" className="text-xs text-muted-foreground">Test message</label>
        <Input id="health-message" value={message} onChange={event => setMessage(event.target.value)} maxLength={160} required disabled={pending} />
        <Button type="submit" size="sm" disabled={!connected || !isReady || pending || !message.trim()}>{pending ? 'Sending…' : 'Send health check'}<ArrowUpRight size={14} /></Button>
      </form>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="space-y-3 border-t border-border pt-5">
        <p className="text-xs text-muted-foreground">Recent records · {connected && isReady ? 'Live' : 'Waiting for connection'}</p>
        <ul aria-label="Health-check records" className="space-y-3">
          {recent.map(row => <li key={row.id.toString()} className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="break-all">{row.message}</span><time className="text-xs text-muted-foreground" dateTime={row.createdAt.toDate().toISOString()}>{row.createdAt.toDate().toLocaleTimeString()}</time>
          </li>)}
        </ul>
        {recent.length === 0 && <p className="text-sm text-muted-foreground">No health checks received yet.</p>}
      </div>
    </CardContent>
  </Card>;
}
