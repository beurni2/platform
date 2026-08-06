import { describe, expect, it } from 'vitest';
import {
  FUND_ADMISSIBLE_FAULT_CLASSES,
  PROTECTION_CLAIM_STATES_V1,
  computeCommittedClaimsAmount,
  deriveSolvency,
  isForwardStep,
  isFundAdmissibleFaultClass,
} from '../src/fund-core.js';
import { FAULT_CLASSES } from '@platform/contracts';

describe('claim states — the reference vocabulary, forward-only', () => {
  it('carries the reference version and exactly three states in order', () => {
    expect(PROTECTION_CLAIM_STATES_V1.version).toBe('protection-claim-states.v1');
    expect(PROTECTION_CLAIM_STATES_V1.states).toEqual(['opened', 'under_review', 'resolved']);
  });

  it('advances one step forward only — never skips, never reverses, never stays', () => {
    expect(isForwardStep('opened', 'under_review')).toBe(true);
    expect(isForwardStep('under_review', 'resolved')).toBe(true);
    expect(isForwardStep('opened', 'resolved')).toBe(false); // skip
    expect(isForwardStep('resolved', 'under_review')).toBe(false); // reverse
    expect(isForwardStep('under_review', 'under_review')).toBe(false); // stay
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

describe('committedClaimsAmount — unresolved claims only, exact francs', () => {
  it('sums opened + under_review, excludes resolved', () => {
    expect(
      computeCommittedClaimsAmount([
        { amount: 11_000, state: 'opened' },
        { amount: 4_500, state: 'under_review' },
        { amount: 99_999, state: 'resolved' },
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
