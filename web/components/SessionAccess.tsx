'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';

// Public reviewer experience. This is not a secret and not an auth credential;
// server-side Origin fencing, spend ledger and daily quota protect paid calls.
const PUBLIC_DEMO_SESSION = 'public-demo-session';
const SessionAccess = createContext({ code: PUBLIC_DEMO_SESSION, reviewEpoch: 0 });
export const useSessionAccess = () => useContext(SessionAccess);
export default function SessionAccessProvider({ children, reviewEpoch }: { children: ReactNode; reviewEpoch: number }) {
  const [session, setSession] = useState(0);
  return <SessionAccess.Provider value={{ code: PUBLIC_DEMO_SESSION, reviewEpoch }}>
    <section className="session-access" aria-label="Demo session access">
      <div>
        <strong className="access-verified" role="status">✓ Public demo access</strong>
        <p className="help">Open for evaluator testing. Paid scans are capped server-side at 50 per UTC day; saved review history remains available without a code.</p>
      </div>
      <button onClick={() => setSession(s => s + 1)}>Reset page session</button>
    </section>
    <div key={session}>{children}</div>
  </SessionAccess.Provider>;
}
