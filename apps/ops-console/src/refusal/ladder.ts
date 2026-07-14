/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Ce bureau REGARDE, il n'actionne rien.
 * L'échelle de refus est une vue en lecture seule : aucune commande, aucun
 * levier, aucune écriture. Un état d'échelle est une CONSÉQUENCE de ce que le
 * client a déjà fait — jamais un jugement, jamais un drame.
 */

/**
 * DESK 6 — BUYER REFUSAL-LADDER OVERSIGHT (read model, WO-OPS-DESK-6).
 * RENDER-ONLY. This desk issues NO command; the `OpsActionType` union does NOT
 * grow. The read model imports ONLY the canon TYPE `PayAtDoorEligibility` —
 * no runtime schema, no maker-checker, no spine — so it structurally cannot
 * write (the sera D1/D3 « vue sans levier » pattern, applied here).
 *
 * CUSTODY OF TRUTH: every underlying field (state, riskState, refusalCount,
 * reason, requiredDeposit, prepayOnlyUntil) is carried through VERBATIM from the
 * emitted `PayAtDoorEligibility` — never recomputed, never editorialised. The
 * only DERIVED value is a presentation `rung` + `eligibility`, and it follows
 * shop's OWN precedence, quoted from its bytes
 * (shop-plus/packages/commerce-core/src/pay-at-door-policy.ts):
 *   state !== 'allowed' → refuse  ·  active prepayOnlyUntil → prepay-only
 *   requiredDeposit > 0 → refuse.
 * The canon rung names are §9.2 Desk 6 ("good standing → deposit required →
 * prepay-only") + §11 ("pay-at-door suspended"). This is a MIRROR of a decision
 * shop already made and emitted — not a new decision, and it touches no franc.
 *
 * TRANSPORT GAP (flagged, honest): `PayAtDoorEligibility` is emitted INSIDE
 * shop-plus and does not yet cross into platform's boundary — there is no live
 * feed here. Until an integration slice wires it, this desk renders a certified
 * PREVIEW (see `sandbox.ts`), clearly labelled « Aperçu ». No feed is invented.
 */
import type { PayAtDoorEligibility } from '@platform/contracts';

/** The rungs, best → most restricted (§9.2 Desk 6 + §11). */
export type LadderRung = 'good_standing' | 'deposit_required' | 'prepay_only' | 'suspended';

export const LADDER_RUNGS: readonly LadderRung[] = [
  'good_standing',
  'deposit_required',
  'prepay_only',
  'suspended',
];

export interface RefusalLadderRow {
  readonly buyerRef: string;
  /** DERIVED (presentation only) — shop's precedence, see header. */
  readonly rung: LadderRung;
  /** DERIVED — 'allowed' iff good standing; else 'restricted'. */
  readonly eligibility: 'allowed' | 'restricted';
  // ── VERBATIM from the emitted shape — custody of truth, never recomputed ──
  readonly state: string;
  readonly riskState: string;
  readonly refusalCount: number;
  readonly reason: string | undefined;
  readonly requiredDeposit: number;
  readonly prepayOnlyUntil: string | undefined;
}

export interface RefusalLadderBoard {
  readonly rungs: readonly LadderRung[];
  readonly rows: readonly RefusalLadderRow[];
}

/**
 * Derive the read-only board. Pure: no write, no command, no wall-clock (the
 * caller passes `nowIso` — a fixed clock in the preview). The prepay-only window
 * is "active" only while `nowIso < prepayOnlyUntil`, exactly as shop evaluates it.
 */
export function deriveRefusalLadder(
  records: readonly PayAtDoorEligibility[],
  nowIso: string,
): RefusalLadderBoard {
  const rows: RefusalLadderRow[] = records.map((r) => {
    const activePrepay = r.prepayOnlyUntil !== undefined && nowIso < r.prepayOnlyUntil;
    const rung: LadderRung =
      r.state !== 'allowed'
        ? 'suspended'
        : activePrepay
          ? 'prepay_only'
          : r.requiredDeposit > 0
            ? 'deposit_required'
            : 'good_standing';
    return {
      buyerRef: r.buyerRef,
      rung,
      eligibility: rung === 'good_standing' ? 'allowed' : 'restricted',
      state: r.state,
      riskState: r.buyerRiskState,
      refusalCount: r.buyerRefusalCount,
      reason: r.reason,
      requiredDeposit: r.requiredDeposit,
      prepayOnlyUntil: r.prepayOnlyUntil,
    };
  });
  return { rungs: LADDER_RUNGS, rows };
}
