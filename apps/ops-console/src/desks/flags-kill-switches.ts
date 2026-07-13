/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */
import type { Desk } from './types';

/**
 * Desk 7 — Flags & kill-switches (ECOSYSTEM-MASTER-REFERENCE.md §9.2; Execution
 * Contract §7.2). Every capability can be turned off without a deploy. Every
 * flip writes an AuditRow (typed confirmation, no one-tap catastrophe). Not
 * wired to data.
 */
export const flagsKillSwitches: Desk = {
  id: 'flags-kill-switches',
  canon: 'Desk 7 — Flags & kill-switches (§9.2)',
  titleKey: 'desk.flags_kill_switches',
  glyph: 'filtre',
};
