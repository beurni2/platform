/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 */

/**
 * Desk 1 HTTP port (FONDS-2) — the fetch adapter over the live
 * protection-service (one Bearer door, `PROTECTION_OPS_SECRET`). The key is
 * ENTERED BY THE FOUNDER at the desk and lives in memory for the session —
 * never in the bundle, never in storage (the boutik console's key-door law).
 * Every response is read defensively: a shape this adapter does not recognise
 * renders as an error, never as invented data.
 */

import type { FaultClass, FundSolvencyState } from '@platform/contracts';
import { isClaimState, type ClaimState } from '@platform/protection-service';
import type { FondsActionResult, FondsClaimRow, FondsData, FondsPort, OpenClaimInput } from './port';

interface WireStoredClaim {
  readonly claim: {
    readonly orderId: string;
    readonly reason: string;
    readonly amount: number;
    readonly faultClass: FaultClass;
    readonly evidenceBundleId: string;
    readonly state: string;
  };
  readonly openedAt: string;
  readonly refundRequired?: { readonly buyerPriority: boolean };
  readonly advanced: ReadonlyArray<{ readonly to: string; readonly settlementRef?: string }>;
}

function toRow(stored: WireStoredClaim): FondsClaimRow | null {
  const c = stored.claim;
  if (!isClaimState(c.state)) return null;
  const settlementRef = stored.advanced.find((a) => a.settlementRef !== undefined)?.settlementRef;
  return {
    orderId: c.orderId,
    faultClass: c.faultClass,
    state: c.state,
    amountFcfa: c.amount,
    reason: c.reason,
    evidenceBundleId: c.evidenceBundleId,
    ...(settlementRef !== undefined ? { settlementRef } : {}),
    openedAt: stored.openedAt,
    refundRequired: stored.refundRequired !== undefined,
  };
}

export class HttpFondsPort implements FondsPort {
  constructor(
    private readonly base: string,
    private readonly key: string,
  ) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' };
  }

  async load(): Promise<FondsData> {
    const [claimsRes, fundRes] = await Promise.all([
      fetch(`${this.base}/claims`, { headers: this.headers() }),
      fetch(`${this.base}/fund`, { headers: this.headers() }),
    ]);
    if (!claimsRes.ok || !fundRes.ok) {
      throw new Error(claimsRes.status === 401 || fundRes.status === 401 ? 'unauthorized' : 'unreachable');
    }
    const claimsBody = (await claimsRes.json()) as { claims: WireStoredClaim[] };
    const fundBody = (await fundRes.json()) as {
      declaration: {
        balanceFcfa: number;
        openingFundCapitalFcfa?: number;
        declaredAt: string;
      } | null;
      declarationCount: number;
      committedClaimsAmountFcfa: number;
      solvency: { state: FundSolvencyState | null; availableAfterCommitmentsFcfa: number | null };
    };
    return {
      fund: {
        balanceFcfa: fundBody.declaration?.balanceFcfa ?? null,
        openingFundCapitalFcfa: fundBody.declaration?.openingFundCapitalFcfa ?? null,
        declaredAt: fundBody.declaration?.declaredAt ?? null,
        declarationCount: fundBody.declarationCount,
        committedClaimsAmountFcfa: fundBody.committedClaimsAmountFcfa,
        solvencyState: fundBody.solvency.state,
        availableAfterCommitmentsFcfa: fundBody.solvency.availableAfterCommitmentsFcfa,
      },
      claims: claimsBody.claims
        .map(toRow)
        .filter((r): r is FondsClaimRow => r !== null),
    };
  }

  private async action(path: string, method: string, body: Record<string, unknown>): Promise<FondsActionResult> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: this.headers(),
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res === null) return { ok: false, error: 'unreachable' };
    if (res.ok) return { ok: true };
    const parsed = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: parsed?.error ?? 'unreachable' };
  }

  async openClaim(input: OpenClaimInput): Promise<FondsActionResult> {
    return this.action('/claims', 'POST', { ...input });
  }

  async advance(orderId: string, to: ClaimState, settlementRef?: string): Promise<FondsActionResult> {
    return this.action(`/claims/${encodeURIComponent(orderId)}/advance`, 'POST', {
      to,
      ...(settlementRef !== undefined ? { settlementRef } : {}),
    });
  }

  async declare(balanceFcfa: number, openingFundCapitalFcfa?: number): Promise<FondsActionResult> {
    return this.action('/fund', 'PUT', {
      commandId: crypto.randomUUID(),
      balanceFcfa,
      ...(openingFundCapitalFcfa !== undefined ? { openingFundCapitalFcfa } : {}),
    });
  }
}
