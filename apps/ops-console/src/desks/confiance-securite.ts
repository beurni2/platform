/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */
import type { Desk } from './types';

/**
 * Desk 4 — Trust & safety / related-party review (ECOSYSTEM-MASTER-REFERENCE.md
 * §9.2). Auto-void vs manual review; a low-confidence signal may not auto-void
 * a legitimate reward or order — suspicion is not proof. Not wired to data.
 */
export const confianceSecurite: Desk = {
  id: 'confiance-securite',
  canon: 'Desk 4 — Trust & safety (§9.2)',
  titleKey: 'desk.confiance_securite',
  glyph: 'recherche',
};
