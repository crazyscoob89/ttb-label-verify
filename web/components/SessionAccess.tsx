'use client';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

// The credential lives only in this mounted workspace. Never in storage, URLs or logs.
const SessionAccess = createContext({ code: '', reviewEpoch: 0 });
export const useSessionAccess = () => useContext(SessionAccess);
export default function SessionAccessProvider({ children, reviewEpoch }: { children: ReactNode; reviewEpoch: number }) {
  const [candidate, setCandidate] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [session, setSession] = useState(0);
  async function verify() {
    if (!candidate || pending.current) return;
    pending.current = true; setBusy(true); setMessage('');
    try {
      // Existing authenticated, Origin-fenced, side-effect-free endpoint. No extraction.
      const response = await fetch('/api/reviews/list', { method: 'POST', headers: { 'x-ttb-demo-code': candidate }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (response.ok && Array.isArray(data.reviews)) { setCode(candidate); setCandidate(''); }
      else if (response.status === 403 && data.code === 'access-denied') setMessage('Access denied. Check the code or ask the demo administrator whether access is enabled.');
      else setMessage('Access check unavailable. This is not a bad-code result. The history service may be busy or unconfigured; try verification again later.');
    } catch { setMessage('Access check unavailable due to a network or service error. This does not mean the code is wrong.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <SessionAccess.Provider value={{ code, reviewEpoch }}>
    <section className="session-access" aria-label="Demo session access">
      {code ? <><div><strong className="access-verified" role="status">✓ Access verified</strong><p className="help">Reused for Single, Batch and saved history in this page session. Shared demo access, not individual reviewer identity.</p></div><button onClick={() => { setCode(''); setCandidate(''); setMessage(''); setSession(s => s + 1); }}>Clear session</button></> : <form onSubmit={e => { e.preventDefault(); void verify(); }} autoComplete="off"><div><label htmlFor="session-code">Demo access code</label><input id="session-code" type="password" maxLength={256} value={candidate} disabled={busy} onChange={e => { setCandidate(e.target.value); setMessage(''); }} autoComplete="off" /></div><button disabled={!candidate || busy}>{busy ? 'Verifying…' : 'Verify access'}</button><p className="help">Verify once for Single, Batch and history. You can select images before verification; nothing is uploaded.</p></form>}
      {message && <p role="alert">{message}</p>}
    </section>
    <div key={session}>{children}</div>
  </SessionAccess.Provider>;
}
