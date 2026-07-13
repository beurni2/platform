/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */
import type { Desk } from './types';

/**
 * Desk 8 — The audit log (ECOSYSTEM-MASTER-REFERENCE.md §9.2). Append-only:
 * who, what, why, when, against which entity, with which evidence. Money and
 * custody actions are maker-checker. The append-only spine is proven in
 * src/audit-log.ts; this desk is its (not-yet-wired) surface. Not wired to data.
 */
export const journalAudit: Desk = {
  id: 'journal-audit',
  canon: 'Desk 8 — The audit log (§9.2)',
  titleKey: 'desk.journal_audit',
  glyph: 'horloge',
};
