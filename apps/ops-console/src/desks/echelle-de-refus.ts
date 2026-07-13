/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */
import type { Desk } from './types';

/**
 * Desk 6 — Buyer refusal ladder oversight (ECOSYSTEM-MASTER-REFERENCE.md §9.2).
 * PayAtDoorEligibility across the buyer population (good standing → deposit
 * required → prepay-only). Justified refusals never count. Not wired to data.
 */
export const echelleDeRefus: Desk = {
  id: 'echelle-de-refus',
  canon: 'Desk 6 — Refusal ladder oversight (§9.2)',
  titleKey: 'desk.echelle_de_refus',
  glyph: 'refus',
};
