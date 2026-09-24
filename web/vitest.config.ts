import { defineConfig } from 'vitest/config';

export default defineConfig({
  // testTimeout: private-ledger tests spawn a PowerShell ACL inspection
  // per provision/open on Windows (see lib/ledger-security.ts) — ~400-800ms each
  // in isolation, but multi-second under full-suite parallel load when many
  // workers spawn PowerShell concurrently. Tests with several provision/reopen
  // cycles legitimately exceed the 5000ms default; this is slow security IO by
  // design, not a hang. 120s covers worst-case contention (live-batch-route
  // already used 60s per-file for the same reason).
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**'], environment: 'node', testTimeout: 120000 },
});
