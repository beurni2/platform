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
 * The union grows one member per real command, derived from commands that
 * actually exist — never widened to `string`, never scattered:
 *   - WO-OPS-1a: `'moderation:decide'` (Desk 3; canon `ModerationDecisionSchema`).
 *     The `pending:*` sentinel was retired here.
 *   - WO-OPS-1b: `'breakglass:issue'` (Desk 5; the payment operator's issuing
 *     half of the break-glass seam; canon `HandoffAuthorization` machinery).
 */
export type OpsActionType = 'moderation:decide' | 'breakglass:issue';

/** The Desk 3 command action-type: an operator decides a listing's moderation. */
export const OPS_ACTION_MODERATION_DECIDE: OpsActionType = 'moderation:decide';

/** The Desk 5 command action-type: a payment operator issues a break-glass authorization. */
export const OPS_ACTION_BREAKGLASS_ISSUE: OpsActionType = 'breakglass:issue';
