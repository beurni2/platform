/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 * Maker-checker — deux personnes différentes — sur tout ce qui touche à
 * l'argent ou à la garde. Si un humain peut déplacer un franc en silence,
 * toutes les promesses de ce système sont du théâtre.
 */
import type { Desk } from './types';

/**
 * Desk 3 — Moderation (ECOSYSTEM-MASTER-REFERENCE.md §9.2). The Boutik+ queue
 * for facts, media, categories — specific, actionable reasons, never a silent
 * rejection; no self-moderation. Deterministic imaging rules. LIVE since
 * WO-OPS-1a: the router (main.ts) renders the moderation queue from the real
 * moderation:decide command path; this descriptor stays a pure record.
 */
export const moderation: Desk = {
  id: 'moderation',
  canon: 'Desk 3 — Moderation (§9.2)',
  titleKey: 'desk.moderation',
  glyph: 'oeil',
};
