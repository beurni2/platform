/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * THE AUDIT-LOG PRIMITIVE (WO-OPS-0 spine).
 *
 * Canon (ECOSYSTEM-MASTER-REFERENCE.md §9.2 Desk 8): "Append-only. Every ops
 * action: who, what, why, when, against which order, with which evidence."
 * Design (docs/design/components.md — AuditRow): "No edit affordance exists —
 * there is no editable state to design."
 *
 * The record is append-only by CONSTRUCTION: appended entries are deeply
 * frozen, the backing array is private (`#entries`), and there is no remove /
 * delete / update affordance anywhere on the surface. An entry cannot be
 * mutated or deleted — both are proven in test/audit-log.test.ts.
 *
 * `who` and `when` come from canon's EventEnvelope (`actor`, `serverTime`),
 * consumed VERBATIM. `action` ("what") is a LOCAL, non-canon field: canon's
 * EVENT_NAMES registry has no ops-command event and canon forbids inventing
 * event names (founder ruling 2026-07-13; flagged in JOURNAL.md).
 */
import { EventEnvelopeSchema, type EventEnvelope } from '@platform/contracts';

/** The six facts every audit entry must carry (canon Desk 8). */
export interface AuditEntryInput {
  /** what — a LOCAL action-type; NOT a canon EVENT_NAMES entry (see header). */
  readonly action: string;
  /** why — the operator's stated reason. */
  readonly reason: string;
  /** against which entity — the order / claim / capability the action targets. */
  readonly entity: string;
  /** with what evidence — a reference to the supporting evidence. */
  readonly evidence: string;
  /** who=envelope.actor · when=envelope.serverTime · command/correlation/version. */
  readonly envelope: EventEnvelope;
}

export interface AuditEntry extends AuditEntryInput {
  /** monotonic append order — assigned by the log, never by the caller. */
  readonly seq: number;
}

/** Recursively freeze an object graph so any write attempt throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * An append-only audit log. `append` is the ONLY mutator; there is deliberately
 * no way to change or remove an entry once written — that is the point.
 */
export class AuditLog {
  readonly #entries: AuditEntry[] = [];

  /** Append one entry. Returns the frozen, sequence-stamped entry that was stored. */
  append(input: AuditEntryInput): AuditEntry {
    // Consume canon: an invalid envelope is refused at the boundary.
    EventEnvelopeSchema.parse(input.envelope);
    const entry = deepFreeze<AuditEntry>({
      action: input.action,
      reason: input.reason,
      entity: input.entity,
      evidence: input.evidence,
      envelope: { ...input.envelope },
      seq: this.#entries.length,
    });
    this.#entries.push(entry);
    return entry;
  }

  /**
   * A frozen snapshot of the log. The entries are deeply frozen and the array
   * itself is frozen, so neither the entries nor the sequence can be edited or
   * trimmed through this handle — and the backing store is private.
   */
  get entries(): readonly AuditEntry[] {
    return Object.freeze(this.#entries.slice());
  }

  get length(): number {
    return this.#entries.length;
  }
}
