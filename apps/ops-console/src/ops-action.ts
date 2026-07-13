/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * THE OPS ACTION-TYPE — a QUARANTINED LOCAL CLOSED UNION.
 *
 * CTO ruling (2026-07-13): canon's closed `EVENT_NAMES` registry carries NO
 * ops-command event and canon forbids inventing event names, so the "what" of an
 * ops command is NOT canon — it is a LOCAL, CLOSED union quarantined in this one
 * file, consumed alongside canon's `EventEnvelope` (taken verbatim for
 * who/when/command/correlation/version).
 *
 * WO-OPS-1a paid the named debt: the union was a single `pending:*` sentinel
 * while no command existed; it now carries its FIRST REAL member —
 * `'moderation:decide'`, the Desk 3 command whose PAYLOAD is canon's
 * `ModerationDecisionSchema` (v0.9.6). The sentinel is retired. Future real
 * commands (OPS-1b payment / break-glass) add their members HERE, derived from
 * commands that actually exist — never widened to `string`, never scattered.
 */
export type OpsActionType = 'moderation:decide';

/** The Desk 3 command action-type: an operator decides a listing's moderation. */
export const OPS_ACTION_MODERATION_DECIDE: OpsActionType = 'moderation:decide';
