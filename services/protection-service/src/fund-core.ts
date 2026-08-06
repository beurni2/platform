/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 */

/**
 * FONDS-1 — the Protection Fund claims book, pure core.
 *
 * SPEC AUTHORITY (quoted, per the re-read law):
 *  · ECOSYSTEM-MASTER-REFERENCE §9.2 Desk 1 — « Solvency state, capitalization
 *    (funded before launch, never from float), and claims by faultClass. The
 *    law that must never bend (B+I-13): buyer refunds are NEVER gated on the
 *    fund's solvency. »
 *  · §9.2 Desk 2 (fault routing) — « Séra fault (loss/damage in custody) →
 *    CustodyLiabilityClaim — Séra's own instrument, separate from the fund. »
 *    Boutik-Plus-Build-Spec §6: « Séra-caused product loss/damage =
 *    CustodyLiabilityClaim, not a fund payout. Every claim carries a
 *    faultClass. »
 *  · B+I-12 — « No seller deposit, reserve, guarantee, bond, subscription, or
 *    onboarding fee… consequences are access-based. » Nothing in this service
 *    debits, reserves, or holds anything of a seller's.
 *  · Founder ruling 2026-08-06 — the fund's MONEY moves OFFLINE (opening
 *    capital and claim payouts are manual); the software records claims and
 *    dated balance declarations so pilot loss is measured (§12 ⏳ « seed
 *    conservative, calibrate to pilot loss »). No franc moves in software.
 *
 * WHAT THIS MODULE IS: the deterministic vocabulary + derivations the Worker
 * and its tests share. No storage, no fetch, no clock — callers pass time in.
 */

import { FAULT_CLASSES, type FaultClass, type FundSolvencyState } from '@platform/contracts';

/**
 * The versioned LOCAL claim-state vocabulary — carried over VERBATIM from
 * `@boutik/fulfillment-service`'s PROTECTION_CLAIM_STATES_V1 (the tested
 * reference): canon's ProtectionClaimSchema keeps `state` a bare string
 * (deliberately unenumerated), so this stays a journal-flagged candidate for a
 * future founder-owned canon enumeration — never written into the pinned
 * package from here.
 */
export const PROTECTION_CLAIM_STATES_V1 = {
  version: 'protection-claim-states.v1',
  states: ['opened', 'under_review', 'resolved'],
} as const;
export type ClaimState = (typeof PROTECTION_CLAIM_STATES_V1.states)[number];

export function isClaimState(v: unknown): v is ClaimState {
  return typeof v === 'string' && (PROTECTION_CLAIM_STATES_V1.states as readonly string[]).includes(v);
}

/** Forward-only, one step at a time — the reference's `advanceClaim` law. */
export function isForwardStep(from: ClaimState, to: ClaimState): boolean {
  const order = PROTECTION_CLAIM_STATES_V1.states;
  return order.indexOf(to) === order.indexOf(from) + 1;
}

/**
 * Desk 2 routing, enforced at the door: a Séra-caused loss is a
 * `CustodyLiabilityClaim` — « Séra's own instrument, separate from the fund » —
 * so this book refuses `faultClass: 'sera'` BY NAME rather than absorbing a
 * liability the fund does not carry. Every other canon fault class (including
 * `unresolved`, which a later human review reclassifies) is admissible.
 */
export const FUND_ADMISSIBLE_FAULT_CLASSES: readonly FaultClass[] = FAULT_CLASSES.filter(
  (f) => f !== 'sera',
);

export function isFundAdmissibleFaultClass(v: unknown): v is FaultClass {
  return typeof v === 'string' && (FUND_ADMISSIBLE_FAULT_CLASSES as readonly string[]).includes(v);
}

/**
 * committedClaimsAmount (canon ProtectionFundSchema field name): the sum of
 * every UNRESOLVED claim's amount. This is the fund's OWN bookkeeping
 * (Ledger&Settlement owns the fund — §5.2), summing INPUT-COPIED amounts; it
 * computes no other domain's figure and no waterfall term.
 */
export function computeCommittedClaimsAmount(
  claims: ReadonlyArray<{ readonly amount: number; readonly state: string }>,
): number {
  return claims.reduce((sum, c) => (c.state === 'resolved' ? sum : sum + c.amount), 0);
}

export interface SolvencyReading {
  /** null until the founder has declared a balance — an honest unknown, never a fake HEALTHY. */
  readonly state: FundSolvencyState | null;
  /** balance − committedClaimsAmount when a declaration exists. */
  readonly availableAfterCommitmentsFcfa: number | null;
}

/**
 * ⚠ SAFEST DEFAULT, FLAGGED (§12 ⏳ « Protection Fund opening capital amount +
 * allocation % » is OPEN): the sizing formula (`requiredProtectionBalance`,
 * stress buffer, WATCH/RESTRICTED bands) needs numbers the founder has not
 * set and pilot data that does not exist. This derivation therefore uses ONLY
 * arithmetic that invents nothing:
 *   · no declaration yet        → null (unknown, shown as unknown)
 *   · balance <  committed      → CRITICAL (the declared balance cannot cover
 *                                 claims already committed — pure arithmetic)
 *   · balance ≥  committed      → HEALTHY
 * WATCH and RESTRICTED are UNREACHABLE until the founder closes the sizing
 * decision — journalled, not silently defaulted.
 */
export function deriveSolvency(
  latestDeclaredBalanceFcfa: number | null,
  committedClaimsAmountFcfa: number,
): SolvencyReading {
  if (latestDeclaredBalanceFcfa === null) {
    return { state: null, availableAfterCommitmentsFcfa: null };
  }
  const available = latestDeclaredBalanceFcfa - committedClaimsAmountFcfa;
  return { state: available < 0 ? 'CRITICAL' : 'HEALTHY', availableAfterCommitmentsFcfa: available };
}
