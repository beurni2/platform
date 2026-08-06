import { describe, expect, it } from 'vitest';
import {
  FUND_ADMISSIBLE_FAULT_CLASSES,
  FUND_COMMITMENT_POLICY_V1,
  PROTECTION_CLAIM_STATES_V2,
  TERMINAL_CLAIM_STATES,
  computeCommittedClaimsAmount,
  deriveSolvency,
  isForwardStep,
  isFundAdmissibleFaultClass,
} from '../src/fund-core.js';
import { FAULT_CLASSES } from '@platform/contracts';

describe('claim states — v2: the reference chain + the no-payout terminal, forward-only', () => {
  it('carries the v2 version: the reference three plus closed_no_payout', () => {
    expect(PROTECTION_CLAIM_STATES_V2.version).toBe('protection-claim-states.v2');
    expect(PROTECTION_CLAIM_STATES_V2.states).toEqual([
      'opened',
      'under_review',
      'resolved',
      'closed_no_payout',
    ]);
    expect(TERMINAL_CLAIM_STATES).toEqual(['resolved', 'closed_no_payout']);
  });

  it('advances one step forward only — never skips, never reverses, never stays', () => {
    expect(isForwardStep('opened', 'under_review')).toBe(true);
    expect(isForwardStep('under_review', 'resolved')).toBe(true);
    expect(isForwardStep('opened', 'resolved')).toBe(false); // skip
    expect(isForwardStep('resolved', 'under_review')).toBe(false); // reverse
    expect(isForwardStep('under_review', 'under_review')).toBe(false); // stay
  });

  it('closes from either non-terminal state; a terminal claim advances nowhere', () => {
    expect(isForwardStep('opened', 'closed_no_payout')).toBe(true);
    expect(isForwardStep('under_review', 'closed_no_payout')).toBe(true);
    expect(isForwardStep('resolved', 'closed_no_payout')).toBe(false); // terminal is terminal
    expect(isForwardStep('closed_no_payout', 'under_review')).toBe(false);
    expect(isForwardStep('closed_no_payout', 'resolved')).toBe(false);
    expect(isForwardStep('closed_no_payout', 'closed_no_payout')).toBe(false);
  });
});

describe('Desk 2 routing — sera is refused, every other canon class admitted', () => {
  it('admits exactly the canon fault classes minus sera', () => {
    expect(FUND_ADMISSIBLE_FAULT_CLASSES).toEqual(FAULT_CLASSES.filter((f) => f !== 'sera'));
    expect(isFundAdmissibleFaultClass('sera')).toBe(false);
    expect(isFundAdmissibleFaultClass('seller')).toBe(true);
    expect(isFundAdmissibleFaultClass('unresolved')).toBe(true);
    expect(isFundAdmissibleFaultClass('invented_class')).toBe(false);
  });
});

describe('committedClaimsAmount — the coverage-list ruling (founder, 2026-08-06), exact francs', () => {
  it('counts open seller + platform_system + unresolved; excludes BOTH terminals', () => {
    expect(
      computeCommittedClaimsAmount([
        { amount: 11_000, state: 'opened', faultClass: 'seller' },
        { amount: 4_500, state: 'under_review', faultClass: 'platform_system' },
        { amount: 2_000, state: 'opened', faultClass: 'unresolved' },
        { amount: 99_999, state: 'resolved', faultClass: 'seller' },
        { amount: 77_777, state: 'closed_no_payout', faultClass: 'seller' },
      ]),
    ).toBe(17_500);
  });

  it('a buyer-fault claim NEVER counts — the buyer forfeits, the fund owes nothing', () => {
    expect(
      computeCommittedClaimsAmount([
        { amount: 50_000, state: 'opened', faultClass: 'buyer' },
        { amount: 50_000, state: 'under_review', faultClass: 'buyer' },
      ]),
    ).toBe(0);
  });

  it('a provider-fault claim never counts — provider arrangement, not a fund payout', () => {
    expect(
      computeCommittedClaimsAmount([{ amount: 30_000, state: 'opened', faultClass: 'payment_provider' }]),
    ).toBe(0);
  });

  it('an UNKNOWN class defaults to counting — conservative, never silently exempt', () => {
    expect(
      computeCommittedClaimsAmount([{ amount: 7_000, state: 'opened', faultClass: 'future_class' }]),
    ).toBe(7_000);
  });

  it('the policy is the founder-ruled data, versioned', () => {
    expect(FUND_COMMITMENT_POLICY_V1.version).toBe('fund-commitment-policy.v1');
    expect(FUND_COMMITMENT_POLICY_V1.countsTowardCommitted).toEqual({
      seller: true,
      buyer: false,
      payment_provider: false,
      platform_system: true,
      unresolved: true,
    });
  });

  it('empty book commits zero', () => {
    expect(computeCommittedClaimsAmount([])).toBe(0);
  });
});

describe('solvency — arithmetic only, no invented thresholds (§12 ⏳ flagged)', () => {
  it('unknown (null) until a balance is declared — never a fake HEALTHY', () => {
    expect(deriveSolvency(null, 0)).toEqual({ state: null, availableAfterCommitmentsFcfa: null });
    expect(deriveSolvency(null, 25_000)).toEqual({ state: null, availableAfterCommitmentsFcfa: null });
  });

  it('CRITICAL exactly when the declared balance cannot cover committed claims', () => {
    expect(deriveSolvency(10_000, 10_001)).toEqual({
      state: 'CRITICAL',
      availableAfterCommitmentsFcfa: -1,
    });
  });

  it('HEALTHY at exact coverage and above — to the franc', () => {
    expect(deriveSolvency(10_000, 10_000)).toEqual({
      state: 'HEALTHY',
      availableAfterCommitmentsFcfa: 0,
    });
    expect(deriveSolvency(50_000, 15_500)).toEqual({
      state: 'HEALTHY',
      availableAfterCommitmentsFcfa: 34_500,
    });
  });

  it('never derives WATCH or RESTRICTED — those bands await the founder’s sizing decision', () => {
    // Sweep a range of ratios; only the two arithmetic states may appear.
    for (const balance of [0, 1, 9_999, 10_000, 100_000]) {
      const s = deriveSolvency(balance, 10_000).state;
      expect(s === 'HEALTHY' || s === 'CRITICAL').toBe(true);
    }
  });
});
