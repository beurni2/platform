/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 */

/**
 * Desk 1 sandbox (FONDS-2) — a PREVIEW (bac à sable) whose derived figures run
 * through the REAL fund core (`@platform/protection-service`), never a copy:
 * committedClaimsAmount and solvency here are computed by the same functions
 * the deployed FondsDO runs, so the preview cannot drift from the book's
 * arithmetic. Rows are static and clearly ribboned as sandbox; the live data
 * source is the configured HTTP port.
 */

import {
  computeCommittedClaimsAmount,
  deriveSolvency,
} from '@platform/protection-service';
import { t } from '../i18n';
import type { FondsClaimRow, FondsData } from './port';

// Reasons come from the catalog (strings live there, never inline) — resolved
// lazily so the module stays importable before the catalog loads.
function sandboxClaims(): readonly FondsClaimRow[] {
  return [
    {
      orderId: 'cmd-apercu-001',
      faultClass: 'seller',
      state: 'resolved',
      amountFcfa: 11_000,
      reason: t('fonds.sandbox_reason_refused_pickup'),
      evidenceBundleId: 'preuve-001',
      settlementRef: 'momo-2026-08-01-farida',
      openedAt: '2026-08-01T09:00:00.000Z',
      refundRequired: true,
    },
    {
      orderId: 'cmd-apercu-002',
      faultClass: 'seller',
      state: 'under_review',
      amountFcfa: 8_000,
      reason: t('fonds.sandbox_reason_never_ready'),
      evidenceBundleId: 'preuve-002',
      openedAt: '2026-08-03T14:30:00.000Z',
      refundRequired: true,
    },
    {
      orderId: 'cmd-apercu-003',
      faultClass: 'buyer',
      state: 'opened',
      amountFcfa: 1_000,
      reason: t('fonds.sandbox_reason_changed_mind'),
      evidenceBundleId: 'preuve-003',
      openedAt: '2026-08-05T11:15:00.000Z',
      refundRequired: false,
    },
  ];
}

const SANDBOX_BALANCE = 100_000;

export function buildSandboxFonds(): FondsData {
  const claims = sandboxClaims();
  const committed = computeCommittedClaimsAmount(
    claims.map((c) => ({ amount: c.amountFcfa, state: c.state, faultClass: c.faultClass })),
  );
  const solvency = deriveSolvency(SANDBOX_BALANCE, committed);
  return {
    fund: {
      balanceFcfa: SANDBOX_BALANCE,
      openingFundCapitalFcfa: SANDBOX_BALANCE,
      declaredAt: '2026-08-01T08:00:00.000Z',
      declarationCount: 1,
      committedClaimsAmountFcfa: committed,
      solvencyState: solvency.state,
      availableAfterCommitmentsFcfa: solvency.availableAfterCommitmentsFcfa,
    },
    claims,
    unrecognizedCount: 0,
  };
}
