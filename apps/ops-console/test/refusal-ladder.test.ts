import { describe, it, expect } from 'vitest';
import { PayAtDoorEligibilitySchema, type PayAtDoorEligibility } from '@platform/contracts';
import { deriveRefusalLadder, LADDER_RUNGS } from '../src/refusal/ladder';
import { buildSandboxRefusalLadder, SANDBOX_NOW } from '../src/refusal/sandbox';

const NOW = '2026-07-14T12:00:00.000Z';
const rec = (over: Partial<PayAtDoorEligibility>): PayAtDoorEligibility => ({
  buyerRef: 'buyer:x',
  state: 'allowed',
  buyerRefusalCount: 0,
  buyerRiskState: 'normal',
  requiredDeposit: 0,
  ...over,
});
const oneRow = (r: PayAtDoorEligibility, now = NOW) => deriveRefusalLadder([r], now).rows[0]!;

describe('WO-OPS-DESK-6 — the refusal-ladder read model (render-only)', () => {
  it('good standing → allowed (state allowed · no deposit · no prepay window)', () => {
    const row = oneRow(rec({}));
    expect(row.rung).toBe('good_standing');
    expect(row.eligibility).toBe('allowed');
  });

  it('a required deposit → deposit_required · restricted', () => {
    const row = oneRow(rec({ requiredDeposit: 2000, buyerRefusalCount: 1 }));
    expect(row.rung).toBe('deposit_required');
    expect(row.eligibility).toBe('restricted');
  });

  it('an ACTIVE prepay-only window → prepay_only · restricted (and expires by the clock)', () => {
    const withWindow = rec({ prepayOnlyUntil: '2026-07-21T00:00:00.000Z', buyerRefusalCount: 2 });
    expect(oneRow(withWindow, NOW).rung).toBe('prepay_only'); // NOW < until → active
    // once the clock passes the window, it is no longer prepay-only (custody of the clock)
    expect(oneRow(withWindow, '2026-07-22T00:00:00.000Z').rung).toBe('good_standing');
  });

  it('state !== allowed → suspended · restricted', () => {
    const row = oneRow(rec({ state: 'suspended', buyerRefusalCount: 4 }));
    expect(row.rung).toBe('suspended');
    expect(row.eligibility).toBe('restricted');
  });

  it("follows shop's OWN precedence: state first, then prepay, then deposit", () => {
    // suspended state wins even with a deposit present
    expect(oneRow(rec({ state: 'suspended', requiredDeposit: 2000 })).rung).toBe('suspended');
    // an active prepay window wins over a deposit (shop checks prepay before deposit)
    expect(
      oneRow(rec({ prepayOnlyUntil: '2026-07-21T00:00:00.000Z', requiredDeposit: 2000 })).rung,
    ).toBe('prepay_only');
  });

  it('CUSTODY OF TRUTH: every underlying field is carried VERBATIM, never recomputed', () => {
    const source = rec({
      buyerRef: 'buyer:fatou',
      state: 'allowed',
      reason: 'Absente au premier passage',
      buyerRefusalCount: 1,
      buyerRiskState: 'watch',
      requiredDeposit: 2000,
      prepayOnlyUntil: '2026-07-21T00:00:00.000Z',
    });
    const row = oneRow(source);
    expect(row.buyerRef).toBe(source.buyerRef);
    expect(row.state).toBe(source.state);
    expect(row.reason).toBe(source.reason);
    expect(row.refusalCount).toBe(source.buyerRefusalCount);
    expect(row.riskState).toBe(source.buyerRiskState);
    expect(row.requiredDeposit).toBe(source.requiredDeposit);
    expect(row.prepayOnlyUntil).toBe(source.prepayOnlyUntil);
  });

  it('VIEW CANNOT WRITE: derive is pure — it never mutates its input source', () => {
    const source = rec({ buyerRef: 'buyer:issa', state: 'suspended', requiredDeposit: 2000 });
    const snapshot = JSON.stringify(source);
    deriveRefusalLadder([source], NOW);
    deriveRefusalLadder([source], NOW); // twice — still no mutation
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('the board exposes the rungs best → most restricted (trend at a glance)', () => {
    expect([...LADDER_RUNGS]).toEqual([
      'good_standing',
      'deposit_required',
      'prepay_only',
      'suspended',
    ]);
  });

  it('the sandbox preview is SHAPE-TRUE and renders one buyer per rung (the degradation)', () => {
    const records = buildSandboxRefusalLadder();
    // shape-true: every seed record round-trips through canon
    for (const r of records) expect(PayAtDoorEligibilitySchema.safeParse(r).success).toBe(true);
    const rungs = deriveRefusalLadder(records, SANDBOX_NOW).rows.map((r) => r.rung);
    expect(rungs).toEqual(['good_standing', 'deposit_required', 'prepay_only', 'suspended']);
  });
});
