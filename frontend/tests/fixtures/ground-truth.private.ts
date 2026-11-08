// Test-only fictional oracle. Never imported by application or seed code; never served by an API.
export const groundTruth = {
  incident: 'IR-2041',
  isolationRequest: '2026-11-07T15:18:00Z',
  trafficObservation: '2026-11-07T15:21:00Z',
  actualOrigin: 'synthetic residual connection from edge-02',
  exfiltratedCustomerContents: false,
  futureChain: ['A-09', 'Customer Database', 'October Customer Records', 'C-1044'],
} as const;
