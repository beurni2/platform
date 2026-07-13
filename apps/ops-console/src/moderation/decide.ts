/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * DESK 3 — THE FIRST REAL OPS COMMAND: moderation:decide (WO-OPS-1a).
 *
 * A reviewing operator (maker) makes a canon `ModerationDecision` about a
 * listing; a SECOND operator (checker) approves it — the maker-checker seam on a
 * real, franc-adjacent action (an approved decision is what lets a listing go
 * live). Everything canon-owned is CONSUMED, nothing invented:
 *   - the payload is canon `ModerationDecisionSchema` (v0.9.6): exactly two
 *     outcomes (approved | changes_requested), a silent/reasonless rejection is
 *     unrepresentable, and `decided_by` MUST be an `ops:moderation:*` actor — so
 *     a SUPPLIER is refused at ISSUE by the schema itself (no self-moderation);
 *   - the `command_id` is MINTED by canon `mintCommandId()` (v0.9.5 rule: UUIDv4
 *     from the OS CSPRNG, never Math.random);
 *   - the two-person seam, and the identity law, are the platform maker-checker
 *     spine.
 * The action-type `'moderation:decide'` is a LOCAL closed-union member
 * (ops-action.ts) — canon names no ops-command event.
 *
 * DEBT ① (named here, in force): the compile-time DistinctChecker guard bites
 * only for LITERAL identity types. Real operator ids arrive from a session token
 * as `string`, so at runtime the type guard is VACUOUS and the RUNTIME identity
 * check in approve() is the ONLY guard standing between this command and a
 * one-person decision. The tests prove that runtime check on THIS real command
 * under a full `any` bypass.
 */
import {
  ModerationDecisionSchema,
  mintCommandId,
  type ModerationDecision,
  type EventEnvelope,
} from '@platform/contracts';
import {
  approve,
  issue,
  type Actor,
  type ActorId,
  type ApprovedCommand,
  type DistinctChecker,
  type IssuedCommand,
} from '../maker-checker';
import { OPS_ACTION_MODERATION_DECIDE } from '../ops-action';

/** A supplier (or any non-`ops:moderation:*` actor) tried to decide or approve. */
export class ModerationActorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModerationActorError';
  }
}

/**
 * Validate that `id` is an `ops:moderation:*` actor by CONSUMING canon's rule:
 * canon keeps the actor regex private but exposes it through
 * `ModerationDecisionSchema` (its `decided_by`), so a minimal decision with this
 * id either parses or does not. We invent no pattern — if canon tightens the
 * rule, this follows. (Canon models only the decider; the checker's ops-actor
 * requirement is the platform maker-checker seam's, enforced here.)
 */
function assertOpsModerationActor(id: string, half: 'maker' | 'checker'): void {
  const ok = ModerationDecisionSchema.safeParse({ decision: 'approved', decided_by: id }).success;
  if (!ok) {
    throw new ModerationActorError(
      `${half} "${id}" is not an ops:moderation:* actor — no self-moderation; a supplier never validates`,
    );
  }
}

export interface IssuedModerationCommand<M extends ActorId = ActorId> {
  readonly command: IssuedCommand<M>;
  readonly decision: ModerationDecision;
  readonly listingId: string;
}

export interface ApprovedModerationCommand<M extends ActorId = ActorId, C extends ActorId = ActorId> {
  readonly command: ApprovedCommand<M, C>;
  readonly decision: ModerationDecision;
  readonly listingId: string;
}

/** Half one: the reviewing operator issues a moderation decision on a listing. */
export function issueModerationDecision<M extends ActorId>(
  maker: Actor<M>,
  input: {
    readonly listingId: string;
    readonly decision: ModerationDecision;
    readonly correlationId: string;
    readonly serverTime: string;
  },
): IssuedModerationCommand<M> {
  // Canon validates the payload: supplier decided_by refused, reasonless
  // changes_requested refused, no extra keys.
  const decision = ModerationDecisionSchema.parse(input.decision);
  if (decision.decided_by !== maker.id) {
    throw new ModerationActorError(
      `decision.decided_by "${decision.decided_by}" must be the issuing maker "${maker.id}" — an operator does not decide as someone else`,
    );
  }
  const envelope: EventEnvelope = {
    command_id: mintCommandId(), // canon mint rule (UUIDv4 · OS CSPRNG)
    correlation_id: input.correlationId,
    aggregateVersion: 0,
    actor: maker.id,
    serverTime: input.serverTime,
    version: '1',
  };
  const command = issue(maker, {
    action: OPS_ACTION_MODERATION_DECIDE,
    reason: decision.decision,
    entity: input.listingId,
    envelope,
  });
  return { command, decision, listingId: input.listingId };
}

/** Half two: a DIFFERENT ops:moderation operator approves the issued decision. */
export function approveModerationDecision<M extends ActorId, C extends ActorId>(
  issued: IssuedModerationCommand<M>,
  checker: DistinctChecker<M, C>,
  input: { readonly correlationId: string; readonly serverTime: string },
): ApprovedModerationCommand<M, C> {
  const checkerActor = checker as Actor<C>;
  // A supplier can never be the second operator (refused at APPROVE).
  assertOpsModerationActor(checkerActor.id, 'checker');
  const envelope: EventEnvelope = {
    command_id: mintCommandId(),
    correlation_id: input.correlationId,
    aggregateVersion: issued.command.envelope.aggregateVersion + 1,
    actor: checkerActor.id,
    serverTime: input.serverTime,
    version: '1',
  };
  // The spine enforces: forged maker-envelope (debt ②), same-identity (debt ①
  // runtime guard), and approval-envelope actor == checker.
  const command = approve(issued.command, checker, envelope);
  return { command, decision: issued.decision, listingId: issued.listingId };
}
