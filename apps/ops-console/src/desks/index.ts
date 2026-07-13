import type { Desk } from './types';
import { fondsDeProtection } from './fonds-de-protection';
import { reclamations } from './reclamations';
import { moderation } from './moderation';
import { confianceSecurite } from './confiance-securite';
import { reconciliationOperateur } from './reconciliation-operateur';
import { echelleDeRefus } from './echelle-de-refus';
import { flagsKillSwitches } from './flags-kill-switches';
import { journalAudit } from './journal-audit';

export type { Desk } from './types';

/** The eight desks, in canon order (ECOSYSTEM-MASTER-REFERENCE.md §9.2, Desk 1→8). */
export const DESKS: readonly Desk[] = [
  fondsDeProtection,
  reclamations,
  moderation,
  confianceSecurite,
  reconciliationOperateur,
  echelleDeRefus,
  flagsKillSwitches,
  journalAudit,
];
