/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * Desk 5 break-glass sandbox (WO-OPS-1b) — a PREVIEW that exercises the REAL
 * issuing command path (two different ops:payment operators, request→approve
 * through breakglass/issue.ts) so the rendered case is honest, not fabricated.
 * No franc leaves; no signature exists; provider-confirm onward is « en attente ».
 */
import { actor } from '../maker-checker';
import { approveBreakGlass, issueBreakGlass } from './issue';
import { deriveBreakGlassBoard, type BreakGlassCaseBoard } from './board';

/** Build the preview break-glass board by running the real command path. */
export function buildSandboxBreakGlass(serverTime: string): BreakGlassCaseBoard {
  const requester = actor('ops:payment:sanou');
  const approver = actor('ops:payment:zerbo');
  const issued = issueBreakGlass(requester, {
    orderId: 'order-o1',
    riderId: 'rider-r1',
    buyerRef: 'buyer-b1',
    exactAmount: 12500,
    providerTransactionReference: 'prov-tx-abc',
    breakGlassCaseId: 'case-bg1',
    reason: 'provider webhook missing; amount verified by phone with the network', // ASCII data
    authorizationExpiresAt: serverTime,
    correlationId: 'sbx-bg',
    serverTime,
  });
  const approved = approveBreakGlass(issued, approver, { correlationId: 'sbx-bg', serverTime });
  return deriveBreakGlassBoard(approved);
}
