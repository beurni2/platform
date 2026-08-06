import { describe, expect, it } from 'vitest';
import {
  FUND_ADMISSIBLE_FAULT_CLASSES,
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

describe('committedClaimsAmount — non-terminal claims only, exact francs', () => {
  it('sums opened + under_review; excludes BOTH terminals (resolved and closed-no-payout)', () => {
    expect(
      computeCommittedClaimsAmount([
        { amount: 11_000, state: 'opened' },
        { amount: 4_500, state: 'under_review' },
        { amount: 99_999, state: 'resolved' },
        { amount: 77_777, state: 'closed_no_payout' },
      ]),
    ).toBe(15_500);
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
