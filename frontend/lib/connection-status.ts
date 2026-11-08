export type ConnectionStatus = 'Connecting' | 'Connected' | 'Disconnected' | 'Connection error';
export function connectionStatus(state: {
  isActive: boolean;
  identity?: unknown;
  connectionError?: Error;
}): ConnectionStatus {
  if (state.isActive) return 'Connected';
  if (state.identity) return 'Disconnected';
  if (state.connectionError) return 'Connection error';
  return 'Connecting';
}
