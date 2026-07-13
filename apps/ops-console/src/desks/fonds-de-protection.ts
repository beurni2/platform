/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */
import type { Desk } from './types';

/**
 * Desk 1 — The Protection Fund (ECOSYSTEM-MASTER-REFERENCE.md §9.2). Solvency,
 * capitalization, claims by faultClass. The law that never bends (B+I-13):
 * buyer refunds are NEVER gated on the fund's solvency. Not wired to data.
 */
export const fondsDeProtection: Desk = {
  id: 'fonds-de-protection',
  canon: 'Desk 1 — Protection Fund (§9.2)',
  titleKey: 'desk.fonds_de_protection',
  glyph: 'cadenas',
};
