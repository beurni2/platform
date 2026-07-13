/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * THE MAKER-CHECKER PRIMITIVE (WO-OPS-0 spine).
 *
 * Canon (ECOSYSTEM-MASTER-REFERENCE.md §9.1, Desk 8, §5 "the maker-checker
 * seam"): "Money and custody actions are maker-checker — two humans, or it
 * does not happen." "Nobody holds both halves. That is the whole point."
 *
 * A command cannot be BOTH issued and approved by the same identity. That is
 * made UNREPRESENTABLE, not merely warned about:
 *   - a TYPE-LEVEL impossibility — `approve(cmd, sameActor, …)` does not
 *     compile (proven in test-d/maker-checker.type-test.ts via @ts-expect-error);
 *   - a RUNTIME refusal — even if the compiler is subverted (a cast, `any`, or
 *     an erased generic crossing a service boundary), approve() throws
 *     (proven in test/maker-checker.test.ts).
 *
 * `EventEnvelope` is consumed VERBATIM from canon (@platform/contracts). Canon's
 * closed EVENT_NAMES registry carries no ops-command event and canon forbids
 * inventing event names; per founder ruling (2026-07-13) the command's `action`
 * ("what") is a LOCAL, non-canon field, flagged in JOURNAL.md for a later canon
 * ops-vocabulary work order.
 */
import { EventEnvelopeSchema, type EventEnvelope } from '@platform/contracts';

export class MakerCheckerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MakerCheckerError';
  }
}

/** The law's terminal refusal: the same identity tried to hold both halves. */
export class MakerCheckerSameIdentityError extends MakerCheckerError {
  constructor(public readonly identity: string) {
    super(
      `same identity "${identity}" cannot both issue and approve a command — maker-checker means two different people`,
    );
    this.name = 'MakerCheckerSameIdentityError';
  }
}

export type ActorId = string;

/**
 * A branded ops-actor identity. Canon defines no ops-actor type; the
 * EventEnvelope's `actor: string` is the canonical carrier (we consume it). The
 * literal identity is carried in the type parameter so the compiler can tell
 * two actors apart.
 */
export interface Actor<Id extends ActorId = ActorId> {
  readonly id: Id;
  readonly __brand: 'ops-actor';
}

/** Mint an ops-actor identity (const param → the literal id survives in the type). */
export function actor<const Id extends ActorId>(id: Id): Actor<Id> {
  if (id.length === 0) throw new MakerCheckerError('actor id must be non-empty');
  return { id, __brand: 'ops-actor' };
}

/** A command ISSUED by a maker (half one). `envelope.actor === maker.id`. */
export interface IssuedCommand<M extends ActorId = ActorId> {
  /** what — a LOCAL action-type; NOT a canon EVENT_NAMES entry (see header). */
  readonly action: string;
  /** why */
  readonly reason: string;
  /** against which entity */
  readonly entity: string;
  /** who issued */
  readonly maker: Actor<M>;
  /** the canonical event envelope (who=actor · when=serverTime · command/correlation/version) */
  readonly envelope: EventEnvelope;
}

/** A command APPROVED by a checker (half two) — issued by M, approved by C, M ≠ C. */
export interface ApprovedCommand<M extends ActorId = ActorId, C extends ActorId = ActorId> {
  readonly command: IssuedCommand<M>;
  readonly checker: Actor<C>;
  readonly envelope: EventEnvelope;
}

/**
 * The distinct-identity guard. The leading `Actor<C>` conjunct is a clean
 * inference site (so `C` is always the checker's literal identity, never
 * widened to `string`). The conditional then poisons the same-identity case:
 * when `C` (checker) equals `M` (maker) the parameter becomes `Actor<C> & never`
 * = `never`, which no value inhabits — so `approve(cmd, sameActor, …)` cannot be
 * called. When they differ it is `Actor<C> & Actor<C>` = `Actor<C>`, callable
 * normally.
 */
export type DistinctChecker<M extends ActorId, C extends ActorId> = Actor<C> &
  (C extends M ? never : Actor<C>);

/** Half one: a maker issues a command. `envelope.actor` must be the maker. */
export function issue<M extends ActorId>(
  maker: Actor<M>,
  input: {
    readonly action: string;
    readonly reason: string;
    readonly entity: string;
    readonly envelope: EventEnvelope;
  },
): IssuedCommand<M> {
  EventEnvelopeSchema.parse(input.envelope);
  if (input.envelope.actor !== maker.id) {
    throw new MakerCheckerError(
      `issued envelope actor "${input.envelope.actor}" must equal the maker "${maker.id}"`,
    );
  }
  return {
    action: input.action,
    reason: input.reason,
    entity: input.entity,
    maker,
    envelope: input.envelope,
  };
}

/**
 * Half two: a DIFFERENT identity approves. Same-identity is impossible at the
 * type level (DistinctChecker) AND refused at runtime (the throw below).
 */
export function approve<M extends ActorId, C extends ActorId>(
  command: IssuedCommand<M>,
  checker: DistinctChecker<M, C>,
  envelope: EventEnvelope,
): ApprovedCommand<M, C> {
  // At runtime the brand/guard is erased; the checker is structurally Actor<C>.
  const checkerActor = checker as Actor<C>;
  EventEnvelopeSchema.parse(envelope);
  // Compare as plain strings: at the type level M and C are provably distinct
  // (that is the guard), so TS considers `maker.id === checker.id` a no-overlap
  // comparison — but at runtime the brands are erased and a subverted call CAN
  // arrive with equal ids. The law is enforced here regardless.
  if ((command.maker.id as string) === (checkerActor.id as string)) {
    throw new MakerCheckerSameIdentityError(command.maker.id);
  }
  if (envelope.actor !== checkerActor.id) {
    throw new MakerCheckerError(
      `approval envelope actor "${envelope.actor}" must equal the checker "${checkerActor.id}"`,
    );
  }
  return { command, checker: checkerActor, envelope };
}
