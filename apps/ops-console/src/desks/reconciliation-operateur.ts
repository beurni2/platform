/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */
import type { Desk } from './types';

/**
 * Desk 5 — Provider reconciliation (ECOSYSTEM-MASTER-REFERENCE.md §9.2). The
 * ledger's obligations vs the provider's truth (the webhooks). On divergence:
 * open a case, alert, protect existing customer promises. Not wired to data.
 */
export const reconciliationOperateur: Desk = {
  id: 'reconciliation-operateur',
  canon: 'Desk 5 — Provider reconciliation (§9.2)',
  titleKey: 'desk.reconciliation_operateur',
  glyph: 'argent',
};
