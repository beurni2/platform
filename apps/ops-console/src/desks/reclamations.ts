/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */
import type { Desk } from './types';

/**
 * Desk 2 — Claims adjudication (ECOSYSTEM-MASTER-REFERENCE.md §9.2). Who pays —
 * the fault-routing table (seller / Séra / buyer / provider / platform). The
 * seller's balance is never debited on seller fault. Not wired to data.
 */
export const reclamations: Desk = {
  id: 'reclamations',
  canon: 'Desk 2 — Claims adjudication (§9.2)',
  titleKey: 'desk.reclamations',
  glyph: 'alerte',
};
