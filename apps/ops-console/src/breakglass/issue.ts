/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * DESK 5 — THE ISSUING HALF OF BREAK-GLASS: breakglass:issue (WO-OPS-1b).
 *
 * The payment operator's half of the seam sera's D5 defined (sera's dispatcher
 * holds the GROUND half only; its issuing lever is structurally absent). Two
 * DIFFERENT payment operators: the FIRST requests issuance for a named break-
 * glass case; a SECOND approves. Everything canon-owned is CONSUMED, never
 * redefined:
 *   - request fields validated by canon `IdSchema` / `FcfaSchema` /
 *     `IsoTimestampSchema`; break_glass ALWAYS carries a `breakGlassCaseId`
 *     (mandatory incident review) — enforced by requiring the id;
 *   - `command_id` minted by canon `mintCommandId` (v0.9.5 rule).
 *
 * ACTOR BOUNDARY — FOUNDER RULING (Beurni, 2026-07-13), quoted verbatim:
 *   "at BOTH halves, only an actor matching ^ops:payment:[A-Za-z0-9._:-]+$
 *    validates; every other actor — supplier, dispatcher, ops:moderation:*,
 *    anything — is refused by non-match. No block-list exists to maintain."
 *   INTERIM: canon will encode this (WO-5.12); until that pin, PLATFORM enforces
 *   the pattern app-side. Executioner of the interim: the re-pin after WO-5.12.
 *
 * THE FOURTH SECRET: this slice models request→approve ONLY. provider_confirmed/
 * issued/consumed are E3-gated and render « en attente » (not modeled here). The
 * `signature` (fourth secret) is NOT in this slice's data — `BreakGlassRequest`
 * carries none, so there is nothing to render, log, or project.
 */
import {
  FcfaSchema,
  IdSchema,
  IsoTimestampSchema,
  mintCommandId,
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
import { OPS_ACTION_BREAKGLASS_ISSUE } from '../ops-action';

/** Founder ruling (Beurni, 2026-07-13), verbatim — the payment-operator allow-list. */
export const PAYMENT_OPERATOR_PATTERN = /^ops:payment:[A-Za-z0-9._:-]+$/;

export class BreakGlassActorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BreakGlassActorError';
  }
}

export class BreakGlassRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BreakGlassRequestError';
  }
}

/** Allow-list guard — the ONLY actors that validate are ops:payment:*. */
function assertPaymentOperator(id: string, half: 'maker' | 'checker'): void {
  if (!PAYMENT_OPERATOR_PATTERN.test(id)) {
    throw new BreakGlassActorError(
      `${half} "${id}" is not an ops:payment:* actor — break-glass issuance validates by allow-list; supplier, dispatcher, ops:moderation:*, and every other actor are refused`,
    );
  }
}

/** The operator-facing break-glass request. Carries NO signature (see header). */
export interface BreakGlassRequest {
  readonly orderId: string;
  readonly riderId: string;
  readonly buyerRef: string;
  /** canon Fcfa — the operators VERIFY it; it never leaves this console. */
  readonly exactAmount: number;
  readonly providerTransactionReference: string;
  /** break_glass ALWAYS carries a case id (mandatory incident review). */
  readonly breakGlassCaseId: string;
  readonly reason: string;
  readonly authorizationExpiresAt: string;
}

function validateRequest(r: BreakGlassRequest): BreakGlassRequest {
  IdSchema.parse(r.orderId);
  IdSchema.parse(r.riderId);
  IdSchema.parse(r.buyerRef);
  IdSchema.parse(r.breakGlassCaseId); // '' fails → break_glass requires a case
  FcfaSchema.parse(r.exactAmount);
  IsoTimestampSchema.parse(r.authorizationExpiresAt);
  if (r.providerTransactionReference.length === 0) {
    throw new BreakGlassRequestError('providerTransactionReference must be non-empty');
  }
  if (r.reason.length === 0) {
    throw new BreakGlassRequestError('reason must be non-empty');
  }
  return r;
}

export interface IssuedBreakGlassCommand<M extends ActorId = ActorId> {
  readonly command: IssuedCommand<M>;
  readonly request: BreakGlassRequest;
}

export interface ApprovedBreakGlassCommand<M extends ActorId = ActorId, C extends ActorId = ActorId> {
  readonly command: ApprovedCommand<M, C>;
  readonly request: BreakGlassRequest;
}

/** Half one: a payment operator requests break-glass issuance for a named case. */
export function issueBreakGlass<M extends ActorId>(
  maker: Actor<M>,
  input: BreakGlassRequest & { readonly correlationId: string; readonly serverTime: string },
): IssuedBreakGlassCommand<M> {
  assertPaymentOperator(maker.id, 'maker');
  const { correlationId, serverTime, ...requestFields } = input;
  const request = validateRequest(requestFields);
  const envelope: EventEnvelope = {
    command_id: mintCommandId(),
    correlation_id: correlationId,
    aggregateVersion: 0,
    actor: maker.id,
    serverTime,
    version: '1',
  };
  const command = issue(maker, {
    action: OPS_ACTION_BREAKGLASS_ISSUE,
    reason: request.reason,
    entity: request.breakGlassCaseId,
    envelope,
  });
  return { command, request };
}

/** Half two: a DIFFERENT payment operator approves the request. */
export function approveBreakGlass<M extends ActorId, C extends ActorId>(
  issued: IssuedBreakGlassCommand<M>,
  checker: DistinctChecker<M, C>,
  input: { readonly correlationId: string; readonly serverTime: string },
): ApprovedBreakGlassCommand<M, C> {
  const checkerActor = checker as Actor<C>;
  assertPaymentOperator(checkerActor.id, 'checker');
  const envelope: EventEnvelope = {
    command_id: mintCommandId(),
    correlation_id: input.correlationId,
    aggregateVersion: issued.command.envelope.aggregateVersion + 1,
    actor: checkerActor.id,
    serverTime: input.serverTime,
    version: '1',
  };
  const command = approve(issued.command, checker, envelope);
  return { command, request: issued.request };
}
