/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * Desk 3 sandbox queue (WO-OPS-1a) — a PREVIEW (bac à sable) that exercises the
 * REAL moderation command path so the rendered states are honest, not fabricated:
 * the `approved` and `changes_requested` rows are produced by a genuine two-
 * operator issue→approve through `moderation/decide.ts` (maker ≠ checker, canon
 * `ModerationDecisionSchema`). No boutik/catalog DB is read — this is a preview,
 * clearly labelled as such by the queue view; a real data source is a later slice.
 */
import type { ModerationDecision, ModerationReasonCode } from '@platform/contracts';
import { actor } from '../maker-checker';
import {
  approveModerationDecision,
  issueModerationDecision,
  type ApprovedModerationCommand,
} from './decide';

export interface QueueItem {
  readonly listingRef: string;
  readonly state: 'pending' | 'approved' | 'changes_requested';
  readonly reasons: readonly ModerationReasonCode[];
}

function toItem(decided: ApprovedModerationCommand): QueueItem {
  const d = decided.decision;
  return {
    listingRef: decided.listingId,
    state: d.decision,
    reasons: d.decision === 'changes_requested' ? d.reasons : [],
  };
}

/** Build the preview queue by running the real command path (issue → approve). */
export function buildSandboxQueue(serverTime: string): readonly QueueItem[] {
  const maker = actor('ops:moderation:diallo');
  const checker = actor('ops:moderation:kabore');

  // A real approved decision (two different operators).
  const approvedDecision: ModerationDecision = {
    decision: 'approved',
    decided_by: 'ops:moderation:diallo',
  };
  const approved = approveModerationDecision(
    issueModerationDecision(maker, {
      listingId: 'listing:pagne-02',
      decision: approvedDecision,
      correlationId: 'sbx-approved',
      serverTime,
    }),
    checker,
    { correlationId: 'sbx-approved', serverTime },
  );

  // A real changes_requested decision naming its reasons verbatim.
  const changesDecision: ModerationDecision = {
    decision: 'changes_requested',
    reasons: ['price_or_contact_in_image', 'not_neutral_packaging'],
    decided_by: 'ops:moderation:diallo',
  };
  const changes = approveModerationDecision(
    issueModerationDecision(maker, {
      listingId: 'listing:miel-03',
      decision: changesDecision,
      correlationId: 'sbx-changes',
      serverTime,
    }),
    checker,
    { correlationId: 'sbx-changes', serverTime },
  );

  return [
    { listingRef: 'listing:savon-01', state: 'pending', reasons: [] },
    toItem(approved),
    toItem(changes),
  ];
}
