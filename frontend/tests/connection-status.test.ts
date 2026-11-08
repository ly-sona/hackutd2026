import { describe, expect, it } from 'vitest';
import { connectionStatus } from '@/lib/connection-status';

describe('connection lifecycle', () => {
  it('reports connecting before the SDK has an identity', () => {
    expect(connectionStatus({ isActive: false })).toBe('Connecting');
  });
  it('reports a live connection', () => {
    expect(connectionStatus({ isActive: true, identity: {} })).toBe('Connected');
  });
  it('distinguishes an initial failure from a dropped connection', () => {
    const connectionError = new Error('Backend offline');
    expect(connectionStatus({ isActive: false, connectionError })).toBe('Connection error');
    expect(connectionStatus({ isActive: false, identity: {}, connectionError })).toBe('Disconnected');
  });
  it('recovers after reconnecting', () => {
    expect(connectionStatus({ isActive: true, identity: {}, connectionError: new Error('Previous failure') })).toBe('Connected');
  });
});
