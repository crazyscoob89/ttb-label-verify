import { defineConfig } from 'vitest/config';

export default defineConfig({
  // testTimeout: private-ledger tests spawn a PowerShell ACL inspection (~400ms)
  // per provision/open on Windows (see lib/ledger-security.ts). Tests with several
  // provision/reopen cycles legitimately exceed the 5000ms default; this is slow
  // security IO by design, not a hang.
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**'], environment: 'node', testTimeout: 30000 },
});
