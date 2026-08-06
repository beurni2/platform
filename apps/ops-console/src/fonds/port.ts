/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 */

/**
 * Desk 1 — the Protection Fund port (FONDS-2). The types the desk renders,
 * mirroring the protection-service wire (services/protection-service in THIS
 * repo — the singleton FondsDO). The desk reads and records; it never
 * computes an amount and never moves a franc (founder ruling 2026-08-06: the
 * fund's money moves offline; software carries the record).
 */

import type { FaultClass, FundSolvencyState } from '@platform/contracts';
import type { ClaimState } from '@platform/protection-service';

export interface FondsClaimRow {
  readonly orderId: string;
  readonly faultClass: FaultClass;
  readonly state: ClaimState;
  readonly amountFcfa: number;
  readonly reason: string;
  readonly evidenceBundleId: string;
  /** Present iff resolved — the offline payment's reference. */
  readonly settlementRef?: string;
  /** Present iff closed_no_payout — why the fund owes nothing. */
  readonly closedReason?: string;
  readonly openedAt: string;
  /** B+I-13 trigger present on seller-fault claims. */
  readonly refundRequired: boolean;
}

export interface FondsFundView {
  readonly balanceFcfa: number | null;
  readonly openingFundCapitalFcfa: number | null;
  readonly declaredAt: string | null;
  readonly declarationCount: number;
  readonly committedClaimsAmountFcfa: number;
  readonly solvencyState: FundSolvencyState | null;
  readonly availableAfterCommitmentsFcfa: number | null;
}

export interface FondsData {
  readonly fund: FondsFundView;
  readonly claims: readonly FondsClaimRow[];
  /**
   * Money records the adapter did not recognize (vocabulary drift). Rendered
   * as a visible warning — a dropped money record must never be silent.
   */
  readonly unrecognizedCount: number;
}

export interface OpenClaimInput {
  readonly orderId: string;
  readonly reason: string;
  readonly faultClass: FaultClass;
  readonly amountFcfa: number;
  readonly evidenceBundleId: string;
}

export type FondsActionResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export interface DeclareInput {
  readonly balanceFcfa: number;
  readonly openingFundCapitalFcfa?: number;
  /** Minted when the form RENDERS (not on submit) so a double-tap replays idempotently. */
  readonly commandId: string;
}

/** The desk's seam: sandbox preview in CI, HTTP against the live book when configured. */
export interface FondsPort {
  load(): Promise<FondsData>;
  openClaim(input: OpenClaimInput): Promise<FondsActionResult>;
  /** `detail` is the settlementRef when to='resolved', the closedReason when to='closed_no_payout'. */
  advance(orderId: string, to: ClaimState, detail?: string): Promise<FondsActionResult>;
  declare(input: DeclareInput): Promise<FondsActionResult>;
}
