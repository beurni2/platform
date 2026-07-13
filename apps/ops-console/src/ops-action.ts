/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */

/**
 * THE OPS ACTION-TYPE — a QUARANTINED LOCAL CLOSED UNION · a NAMED DEBT.
 * CTO ruling, 2026-07-13 (a CTO ruling, overturnable by the CTO — NOT a founder
 * ruling; the founder never ruled on the ops action-type).
 *
 * The maker-checker command and the audit entry each need a "what". Canon's
 * closed `EVENT_NAMES` registry carries NO ops-command / audit / maker-checker
 * event, and canon forbids inventing event names — refusing to invent one was
 * correct. So the "what" is NOT canon: it is a LOCAL, CLOSED union, quarantined
 * in this one file, consumed alongside canon's `EventEnvelope` (which we take
 * verbatim for who/when/command/correlation/version).
 *
 * It carries exactly ONE member today — a sentinel that is explicitly NOT a
 * command — because no ops command exists yet. This keeps the spine exercisable
 * without inventing any ops vocabulary.
 *
 * THE DEBT (to pay down deliberately): when commands that actually exist arrive
 * — and canon names their events — DERIVE the members here from those real
 * commands and retire the sentinel. Do NOT widen this to `string`, and do NOT
 * scatter action literals through the codebase. One quarantined union.
 */
export type OpsActionType = 'pending:no-ops-command-defined';

/** The sole current member — a debt placeholder, not an ops command. */
export const OPS_ACTION_PENDING: OpsActionType = 'pending:no-ops-command-defined';
