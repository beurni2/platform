/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * Desk 5 break-glass board (WO-OPS-1b). The OPERATOR-facing projection of an
 * approved break-glass request: the case, both operators named, and the state
 * machine. It carries `exactAmount` — the operators VERIFY it — but NO
 * `signature` (the fourth secret is not in this slice's data). request→approve
 * reaches `operator_verifying`; `provider_confirmed`/`issued`/`consumed` are
 * E3-gated and render « en attente » — this console never advances them.
 *
 * (A projection TOWARD SERA would additionally omit `exactAmount` — sera's
 * BreakGlassView already does; this slice emits no such projection.)
 */
import type { HandoffAuthorizationState } from '@platform/contracts';
import type { ApprovedBreakGlassCommand } from './issue';

/** The lifecycle the desk displays; steps past operator_verifying are « en attente ». */
const HAPPY_PATH: readonly HandoffAuthorizationState[] = [
  'requested',
  'operator_verifying',
  'provider_confirmed',
  'issued',
  'consumed',
];

/** The state the two-operator seam reaches; provider-confirm onward is not ours. */
const SEAM_STATE: HandoffAuthorizationState = 'operator_verifying';

export interface BreakGlassStep {
  readonly state: HandoffAuthorizationState;
  /** 'pending' renders « en attente » — provider-confirm/issuance are not this console's to reach. */
  readonly status: 'done' | 'current' | 'pending';
}

export interface BreakGlassCaseBoard {
  readonly caseId: string;
  readonly orderId: string;
  readonly riderId: string;
  /** operator-side; verified here, never projected. */
  readonly exactAmount: number;
  /** both operators named — maker-checker, two different people. */
  readonly requestedBy: string;
  readonly approvedBy: string;
  readonly steps: readonly BreakGlassStep[];
}

/**
 * Derive the read-only board from an approved break-glass command. Pure: no
 * write, no clock, no signature, no state advance beyond the seam.
 */
export function deriveBreakGlassBoard(approved: ApprovedBreakGlassCommand): BreakGlassCaseBoard {
  const currentIndex = HAPPY_PATH.indexOf(SEAM_STATE);
  const steps: BreakGlassStep[] = HAPPY_PATH.map((state, i) => ({
    state,
    status: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending',
  }));
  return {
    caseId: approved.request.breakGlassCaseId,
    orderId: approved.request.orderId,
    riderId: approved.request.riderId,
    exactAmount: approved.request.exactAmount,
    requestedBy: approved.command.command.maker.id,
    approvedBy: approved.command.checker.id,
    steps,
  };
}
