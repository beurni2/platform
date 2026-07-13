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
 * authorized payment operator's desk (§9.3). LIVE since WO-OPS-1b: the router
 * (main.ts) renders the payment operator's break-glass ISSUING surface
 * (breakglass:issue) — request→approve, two operators, canon HandoffAuthorization
 * machinery. This descriptor stays a pure record.
 */
export const reconciliationOperateur: Desk = {
  id: 'reconciliation-operateur',
  canon: 'Desk 5 — Provider reconciliation (§9.2)',
  titleKey: 'desk.reconciliation_operateur',
  glyph: 'argent',
};
