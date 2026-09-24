import { DatabaseSync } from 'node:sqlite';
import { closeSync, openSync } from 'node:fs';
import { assertPrivateLedger, assertPrivateLedgerCreation } from './ledger-security';
import { z } from 'zod';
import { bindingSchema, type SpendBinding, type SpendReceipt, type SpendStore } from './spend';

import { DEMO_CEILING, DEMO_RESERVATION } from './demo-store-contracts';
export { DEMO_CEILING, DEMO_RESERVATION } from './demo-store-contracts';
/** One private persistent local volume, shared by ALL service processes. Never
 * auto-provision on startup. Crashed claims/slots intentionally remain blocked. */
export class SqliteSpendStore implements SpendStore {
  private db: DatabaseSync;
  static provision(path: string) {
    assertPrivateLedgerCreation(path);
    const fd = openSync(path, 'wx', 0o600); closeSync(fd);
    assertPrivateLedger(path);
    const db = new DatabaseSync(path);
    try {
      db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;
        CREATE TABLE ledger (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, ceiling INTEGER NOT NULL, incurred INTEGER NOT NULL CHECK(incurred>=0));
        INSERT INTO ledger VALUES (1,1,25000000,0);
        CREATE TABLE holds (reservation TEXT PRIMARY KEY, attempt TEXT NOT NULL UNIQUE, binding TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount=1000000), state TEXT NOT NULL CHECK(state IN ('reserved','claimed','unresolved')), claim TEXT UNIQUE);
        CREATE TABLE work (id TEXT PRIMARY KEY);
        COMMIT;`);
      assertPrivateLedger(path);
    } finally { db.close(); }
  }
  constructor(path: string) {
    assertPrivateLedger(path);
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      assertPrivateLedger(path);
      this.totals();
    } catch (error) { this.db.close(); throw error; }
  }
  close() { this.db.close(); }
  totals(): SpendReceipt['ledger'] {
    const row = this.db.prepare('SELECT * FROM ledger WHERE id=1').get();
    if (!row || row.version !== 1 || row.ceiling !== DEMO_CEILING || typeof row.incurred !== 'number' || !Number.isSafeInteger(row.incurred) || row.incurred < 0) throw Error('Ledger mismatch');
    const sum = this.db.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM holds').get()!.amount as number;
    if (!Number.isSafeInteger(sum) || sum < 0 || row.incurred + sum > DEMO_CEILING) throw Error('Ledger invalid');
    return { currency:'USD', ceilingMicrousd:DEMO_CEILING, incurredMicrousd:row.incurred, unresolvedMicrousd:sum };
  }
  private transaction<T>(work:()=>T):T { this.db.exec('BEGIN IMMEDIATE'); try { const result=work(); this.db.exec('COMMIT');return result; } catch(e) { this.db.exec('ROLLBACK');throw e; } }
  acquireWork(id:string) { return this.transaction(()=> { this.totals(); if ((this.db.prepare('SELECT COUNT(*) AS n FROM work').get()!.n as number)>=2) throw Error('Busy'); this.db.prepare('INSERT INTO work VALUES (?)').run(id); }); }
  releaseWork(id:string) { this.transaction(()=> {this.db.prepare('DELETE FROM work WHERE id=?').run(id);}); }
  /** Advisory duplicate response only. reserve's UNIQUE constraints remain the
   * atomic authority, including concurrent requests/processes and restarts. */
  hasIntent(attemptId: string, reservationId: string) {
    z.uuid().parse(attemptId); z.uuid().parse(reservationId); this.totals();
    return !!this.db.prepare('SELECT 1 FROM holds WHERE attempt=? OR reservation=? LIMIT 1').get(attemptId, reservationId);
  }
  async reserve(input:Readonly<SpendBinding>) {
    const b=bindingSchema.parse(input); if(b.maxCostMicrousd!==DEMO_RESERVATION) throw Error('Reservation mismatch');
    return this.transaction(()=>{const totals=this.totals();if(totals.incurredMicrousd+totals.unresolvedMicrousd+DEMO_RESERVATION>DEMO_CEILING)throw Error('Exhausted');this.db.prepare("INSERT INTO holds VALUES (?,?,?,?, 'reserved',NULL)").run(b.reservationId,b.attemptId,JSON.stringify(b),DEMO_RESERVATION);return {binding:b,state:'reserved',claimId:null,ledger:this.totals()};});
  }
  async claim(input:Readonly<SpendBinding>,claimId:string) {
    const b=bindingSchema.parse(input);z.uuid().parse(claimId);
    return this.transaction(()=>{this.totals();if((this.db.prepare("SELECT COUNT(*) AS n FROM holds WHERE state='claimed'").get()!.n as number)>=2)throw Error('Busy');const result=this.db.prepare("UPDATE holds SET state='claimed',claim=? WHERE reservation=? AND binding=? AND state='reserved'").run(claimId,b.reservationId,JSON.stringify(b));if(result.changes!==1)throw Error('Claim denied');return {binding:b,state:'claimed',claimId,ledger:this.totals()};});
  }
  async complete(input:Readonly<SpendBinding>,claimId:string) {
    const b=bindingSchema.parse(input);
    return this.transaction(()=>{this.totals();const result=this.db.prepare("UPDATE holds SET state='unresolved' WHERE reservation=? AND binding=? AND state='claimed' AND claim=?").run(b.reservationId,JSON.stringify(b),claimId);if(result.changes!==1)throw Error('Completion denied');return {binding:b,state:'unresolved',claimId,ledger:this.totals()};});
  }
}
