/**
 * DESK 6 refusal ladder — COMPILE-LEVEL « vue sans levier » guard
 * (WO-OPS-DESK-6). The read model is RENDER-ONLY: its board and rows are
 * readonly, so no caller can write back through the view — the desk holds no
 * lever. Proven by @ts-expect-error on every mutation attempt.
 */
import { deriveRefusalLadder, type RefusalLadderBoard } from '../src/refusal/ladder';
import type { PayAtDoorEligibility } from '@platform/contracts';

const record: PayAtDoorEligibility = {
  buyerRef: 'buyer:x',
  state: 'allowed',
  buyerRefusalCount: 0,
  buyerRiskState: 'normal',
  requiredDeposit: 0,
};
const board: RefusalLadderBoard = deriveRefusalLadder([record], '2026-07-14T12:00:00.000Z');
const row = board.rows[0]!;

// reading MUST compile
const rung = row.rung;

// writing through the view MUST NOT compile — a row field is read-only
// @ts-expect-error a refusal-ladder row is read-only; the desk holds no lever
row.eligibility = 'allowed';

// the rows collection itself is read-only — no splicing a lever in
// @ts-expect-error the board's rows array is read-only
board.rows[0] = row;

export { rung };
