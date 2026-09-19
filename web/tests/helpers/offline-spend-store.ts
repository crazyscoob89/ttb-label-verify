import type { SpendBinding, SpendReceipt, SpendStore } from '../../lib/spend';

/** TEST ONLY: synchronous Map mutations simulate an atomic store. NOT global money control. */
export class OfflineSpendStore implements SpendStore {
  readonly rows = new Map<string, SpendReceipt>();
  readonly attempts = new Set<string>();
  historical = 0;
  ceiling = 1000;
  fail: 'reserve' | 'claim' | 'complete' | undefined;
  get unresolved() { return [...this.rows.values()].reduce((n, r) => n + r.binding.maxCostMicrousd, 0); }
  totals() { return { currency: 'USD' as const, ceilingMicrousd: this.ceiling, incurredMicrousd: this.historical, unresolvedMicrousd: this.unresolved }; }
  async reserve(binding: SpendBinding): Promise<unknown> {
    if (this.fail === 'reserve') throw new Error('private store payload');
    if (this.rows.has(binding.reservationId) || this.attempts.has(binding.attemptId) ||
        this.historical + this.unresolved + binding.maxCostMicrousd > this.ceiling) return null;
    const receipt: SpendReceipt = { binding: structuredClone(binding), state: 'reserved', claimId: null, ledger: this.totals() };
    this.rows.set(binding.reservationId, receipt); this.attempts.add(binding.attemptId);
    receipt.ledger = this.totals();
    return structuredClone(receipt);
  }
  async claim(binding: SpendBinding, claimId: string): Promise<unknown> {
    if (this.fail === 'claim') throw new Error('private store payload');
    const row = this.rows.get(binding.reservationId);
    if (!row || row.state !== 'reserved' || JSON.stringify(row.binding) !== JSON.stringify(binding)) return null;
    row.state = 'claimed'; row.claimId = claimId; row.ledger = this.totals();
    return structuredClone(row);
  }
  async complete(binding: SpendBinding, claimId: string): Promise<unknown> {
    if (this.fail === 'complete') throw new Error('private store payload');
    const row = this.rows.get(binding.reservationId);
    if (!row || row.state !== 'claimed' || row.claimId !== claimId) return null;
    row.state = 'unresolved'; row.ledger = this.totals();
    return structuredClone(row);
  }
}
