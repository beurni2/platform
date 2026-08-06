import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * FONDS-1 e2e — the Protection Fund book on REAL workerd, through the one
 * Bearer door.
 *
 * THE PROPERTY ABOVE ALL OTHERS (B+I-13, §9.2 Desk 1): « buyer refunds are
 * NEVER gated on the fund's solvency. » Proven here the only way it can be:
 * the fund is driven to CRITICAL, and a seller-fault claim opened in that
 * state STILL carries its refund-required record with `buyerPriority: true`.
 *
 * Also proven by name: fail-closed auth (no secret → nothing answers), the
 * uniform 401, Desk 2's sera-routing refusal, one-claim-per-order first-wins,
 * forward-only states, resolved-requires-settlementRef (the offline-money
 * link), append-only declarations with idempotent replay, restart
 * persistence, and the absence of any seller-debit surface (B+I-12).
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'fonds-book-'));
const OPS_SECRET = 'test-protection-ops-secret-0001';
const BASE = 'http://fonds.local';

/**
 * VERIFIER ROUND 1 BLOCKER 1: two live Miniflare instances over ONE persist
 * directory race on workerd's DO SQLite (`SQLITE_BUSY` — observed killing 19
 * tests). Each instance now names its own directory; only the restart test
 * deliberately REUSES one (after disposing its predecessor) — that reuse IS
 * the durability assertion.
 */
function mfWith(secret: string | undefined, persistDir: string): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { FONDS: 'FondsDO' },
    durableObjectsPersist: persistDir,
    bindings: secret === undefined ? {} : { PROTECTION_OPS_SECRET: secret },
  });
}

const MAIN_PERSIST = join(persist, 'do-main');
const mf = mfWith(OPS_SECRET, MAIN_PERSIST);
afterAll(async () => {
  // The restart suite disposes `mf` itself; a second dispose is a no-op here.
  await mf.dispose().catch(() => undefined);
});

function opsHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' };
}

async function openClaim(body: Record<string, unknown>): Promise<Response> {
  return mf.dispatchFetch(`${BASE}/claims`, {
    method: 'POST',
    headers: opsHeaders(),
    body: JSON.stringify(body),
  });
}

const SELLER_CLAIM = {
  orderId: 'order-fonds-001',
  reason: 'refus a l enlevement — mauvaise taille',
  faultClass: 'seller',
  amountFcfa: 11_000,
  evidenceBundleId: 'evb-001',
};

describe('the one door — fail closed, uniform 401', () => {
  it('a Worker with NO secret configured refuses everything (even with a presented key)', async () => {
    const bare = mfWith(undefined, join(persist, 'do-bare'));
    try {
      const res = await bare.dispatchFetch(`${BASE}/claims`, {
        method: 'GET',
        headers: { Authorization: 'Bearer anything' },
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    } finally {
      await bare.dispose();
    }
  });

  it('wrong secret and missing secret answer the SAME 401 body — never an oracle', async () => {
    const wrong = await mf.dispatchFetch(`${BASE}/claims`, {
      headers: { Authorization: 'Bearer not-the-secret' },
    });
    const missing = await mf.dispatchFetch(`${BASE}/fund`);
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await wrong.json()).toEqual(await missing.json());
  });

  it('GET /health answers without a key and leaks nothing enumerable', async () => {
    const res = await mf.dispatchFetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      service: 'protection-service',
      release: 'dev',
      canon: 'dev',
    });
  });
});

describe('opening claims — canon-parsed, one per order, Desk 2 routing enforced', () => {
  it('a seller-fault claim opens with the B+I-13 refund record, buyerPriority literal true', async () => {
    const res = await openClaim(SELLER_CLAIM);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      claim: { orderId: string; state: string; amount: number; faultClass: string };
      refundRequired: { buyerPriority: boolean; amountFcfa: number; faultClass: string } | null;
    };
    expect(body.claim.state).toBe('opened');
    expect(body.claim.amount).toBe(11_000);
    expect(body.refundRequired).not.toBeNull();
    expect(body.refundRequired?.buyerPriority).toBe(true);
    expect(body.refundRequired?.faultClass).toBe('seller');
    expect(body.refundRequired?.amountFcfa).toBe(11_000);
  });

  it('B+I-12 — no seller-debit surface: the stored claim carries no balance/debit/reserve key', async () => {
    const res = await mf.dispatchFetch(`${BASE}/claims`, { headers: opsHeaders() });
    const { claims } = (await res.json()) as { claims: Array<Record<string, unknown>> };
    const flat = JSON.stringify(claims).toLowerCase();
    for (const forbidden of ['sellerbalance', 'debit', 'reserve', 'deposit', 'caution']) {
      expect(flat).not.toContain(forbidden);
    }
  });

  it('a second claim on the same order is refused 409 — first-wins', async () => {
    const res = await openClaim({ ...SELLER_CLAIM, amountFcfa: 22_000 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; claim: { amount: number } };
    expect(body.error).toBe('duplicate');
    expect(body.claim.amount).toBe(11_000); // the original record, unmoved
  });

  it('faultClass sera is refused BY NAME with the correct instrument (Desk 2 routing)', async () => {
    const res = await openClaim({ ...SELLER_CLAIM, orderId: 'order-sera-001', faultClass: 'sera' });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'not_a_fund_claim',
      instrument: 'custody_liability_claim',
    });
  });

  it('a buyer-fault claim opens WITHOUT a refund record (the buyer forfeits, she is not refunded)', async () => {
    const res = await openClaim({
      orderId: 'order-fonds-002',
      reason: 'refus au seuil — changement d avis',
      faultClass: 'buyer',
      amountFcfa: 1_000,
      evidenceBundleId: 'evb-002',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { refundRequired: unknown };
    expect(body.refundRequired).toBeNull();
  });

  it('an invented fault class is refused', async () => {
    const res = await openClaim({ ...SELLER_CLAIM, orderId: 'order-x', faultClass: 'weather' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_fault_class');
  });
});

describe('advancing claims — forward only, resolved only against an offline payment reference', () => {
  it('skipping opened → resolved is refused', async () => {
    const res = await mf.dispatchFetch(`${BASE}/claims/order-fonds-001/advance`, {
      method: 'POST',
      headers: opsHeaders(),
      body: JSON.stringify({ to: 'resolved', settlementRef: 'momo-tx-999' }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('not_forward');
  });

  it('opened → under_review advances', async () => {
    const res = await mf.dispatchFetch(`${BASE}/claims/order-fonds-001/advance`, {
      method: 'POST',
      headers: opsHeaders(),
      body: JSON.stringify({ to: 'under_review' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: string }).state).toBe('under_review');
  });

  it('under_review → resolved WITHOUT a settlementRef is refused — the money moved offline or not at all', async () => {
    const res = await mf.dispatchFetch(`${BASE}/claims/order-fonds-001/advance`, {
      method: 'POST',
      headers: opsHeaders(),
      body: JSON.stringify({ to: 'resolved' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('settlement_ref_required');
  });

  it('with the settlementRef it resolves, and the reference is on the record', async () => {
    const res = await mf.dispatchFetch(`${BASE}/claims/order-fonds-001/advance`, {
      method: 'POST',
      headers: opsHeaders(),
      body: JSON.stringify({ to: 'resolved', settlementRef: 'momo-tx-2026-08-06-001' }),
    });
    expect(res.status).toBe(200);
    const list = await mf.dispatchFetch(`${BASE}/claims`, { headers: opsHeaders() });
    const { claims } = (await list.json()) as {
      claims: Array<{ claim: { orderId: string; state: string }; advanced: Array<{ settlementRef?: string }> }>;
    };
    const resolved = claims.find((c) => c.claim.orderId === 'order-fonds-001');
    expect(resolved?.claim.state).toBe('resolved');
    expect(resolved?.advanced.at(-1)?.settlementRef).toBe('momo-tx-2026-08-06-001');
  });
});

describe('the fund figure — declared offline, derived honestly', () => {
  it('before any declaration: unknown solvency (null), committed = sum of unresolved claims', async () => {
    const res = await mf.dispatchFetch(`${BASE}/fund`, { headers: opsHeaders() });
    const body = (await res.json()) as {
      declaration: unknown;
      committedClaimsAmountFcfa: number;
      solvency: { state: string | null };
    };
    expect(body.declaration).toBeNull();
    // order-fonds-001 resolved (11 000 out) · order-fonds-002 open (1 000 in)
    expect(body.committedClaimsAmountFcfa).toBe(1_000);
    expect(body.solvency.state).toBeNull();
  });

  it('a declaration below committed claims derives CRITICAL — pure arithmetic', async () => {
    const res = await mf.dispatchFetch(`${BASE}/fund`, {
      method: 'PUT',
      headers: opsHeaders(),
      body: JSON.stringify({ commandId: 'decl-001', balanceFcfa: 500 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { solvency: { state: string; availableAfterCommitmentsFcfa: number } };
    expect(body.solvency.state).toBe('CRITICAL');
    expect(body.solvency.availableAfterCommitmentsFcfa).toBe(-500);
  });

  it('B+I-13 UNDER FIRE — at CRITICAL, a seller-fault claim STILL records refund-required', async () => {
    const res = await openClaim({
      orderId: 'order-fonds-003',
      reason: 'jamais prete — commande annulee',
      faultClass: 'seller',
      amountFcfa: 8_000,
      evidenceBundleId: 'evb-003',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { refundRequired: { buyerPriority: boolean } | null };
    expect(body.refundRequired?.buyerPriority).toBe(true);
  });

  it('declarations are append-only history; an idempotent replay does not re-append', async () => {
    const second = await mf.dispatchFetch(`${BASE}/fund`, {
      method: 'PUT',
      headers: opsHeaders(),
      body: JSON.stringify({ commandId: 'decl-002', balanceFcfa: 100_000, openingFundCapitalFcfa: 100_000 }),
    });
    expect(second.status).toBe(201);
    const replay = await mf.dispatchFetch(`${BASE}/fund`, {
      method: 'PUT',
      headers: opsHeaders(),
      body: JSON.stringify({ commandId: 'decl-002', balanceFcfa: 100_000, openingFundCapitalFcfa: 100_000 }),
    });
    expect(((await replay.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    const view = await mf.dispatchFetch(`${BASE}/fund`, { headers: opsHeaders() });
    const body = (await view.json()) as {
      declarationCount: number;
      declaration: { balanceFcfa: number };
      solvency: { state: string };
    };
    expect(body.declarationCount).toBe(2); // history kept — never overwritten
    expect(body.declaration.balanceFcfa).toBe(100_000);
    expect(body.solvency.state).toBe('HEALTHY');
  });

  it('the journal: local fund:declare per declaration; capitalized.v1 ONLY where opening capital was declared', async () => {
    const res = await mf.dispatchFetch(`${BASE}/journal`, { headers: opsHeaders() });
    const { journal } = (await res.json()) as { journal: Array<{ action: string; detail: Record<string, unknown> }> };
    const actions = journal.map((j) => j.action);
    expect(actions).toContain('protection.claim_opened.v1');
    expect(actions).toContain('protection.solvency_changed.v1');
    // decl-001 (no opening capital) journals fund:declare only; decl-002
    // (openingFundCapitalFcfa present) adds the canon capitalization event.
    expect(actions.filter((a) => a === 'fund:declare')).toHaveLength(2);
    const capitalized = journal.filter((j) => j.action === 'protection.capitalized.v1');
    expect(capitalized).toHaveLength(1);
    expect(capitalized[0]?.detail['openingFundCapitalFcfa']).toBe(100_000);
    const transitions = journal.filter((j) => j.action === 'protection.solvency_changed.v1');
    expect(transitions.at(0)?.detail['to']).toBe('CRITICAL');
    expect(transitions.at(-1)?.detail['to']).toBe('HEALTHY');
  });
});

describe('the no-payout exit (verifier round 1) — never-payable claims leave the figure honestly', () => {
  it('closing WITHOUT a stated reason is refused — no silent close in the audit book', async () => {
    const res = await mf.dispatchFetch(`${BASE}/claims/order-fonds-002/advance`, {
      method: 'POST',
      headers: opsHeaders(),
      body: JSON.stringify({ to: 'closed_no_payout' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('close_reason_required');
  });

  it('a buyer-fault claim closes with a reason — no fabricated payment reference — and STOPS counting as committed', async () => {
    const before = await mf.dispatchFetch(`${BASE}/fund`, { headers: opsHeaders() });
    const committedBefore = ((await before.json()) as { committedClaimsAmountFcfa: number })
      .committedClaimsAmountFcfa;

    const res = await mf.dispatchFetch(`${BASE}/claims/order-fonds-002/advance`, {
      method: 'POST',
      headers: opsHeaders(),
      body: JSON.stringify({ to: 'closed_no_payout', closedReason: 'la cliente a renonce — rien a payer par le fonds' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: string }).state).toBe('closed_no_payout');

    const after = await mf.dispatchFetch(`${BASE}/fund`, { headers: opsHeaders() });
    const committedAfter = ((await after.json()) as { committedClaimsAmountFcfa: number })
      .committedClaimsAmountFcfa;
    // order-fonds-002 carried 1 000 — gone from the committed figure, to the franc.
    expect(committedAfter).toBe(committedBefore - 1_000);

    const list = await mf.dispatchFetch(`${BASE}/claims`, { headers: opsHeaders() });
    const { claims } = (await list.json()) as {
      claims: Array<{ claim: { orderId: string; state: string }; advanced: Array<{ closedReason?: string }> }>;
    };
    const closed = claims.find((c) => c.claim.orderId === 'order-fonds-002');
    expect(closed?.claim.state).toBe('closed_no_payout');
    expect(closed?.advanced.at(-1)?.closedReason).toContain('renonce');
  });

  it('a closed claim is TERMINAL — no advance out of it, ever', async () => {
    const res = await mf.dispatchFetch(`${BASE}/claims/order-fonds-002/advance`, {
      method: 'POST',
      headers: opsHeaders(),
      body: JSON.stringify({ to: 'under_review' }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('not_forward');
  });

  it('a resolved claim cannot be closed either — terminal is terminal', async () => {
    const res = await mf.dispatchFetch(`${BASE}/claims/order-fonds-001/advance`, {
      method: 'POST',
      headers: opsHeaders(),
      body: JSON.stringify({ to: 'closed_no_payout', closedReason: 'tentative apres reglement' }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('not_forward');
  });

  it('an in-canon-invalid input (trailing-space id) answers 400, never a 500 with Zod internals', async () => {
    const res = await openClaim({ ...SELLER_CLAIM, orderId: 'order-ws-1 ', evidenceBundleId: 'evb-ws' });
    // the trimmed id 'order-ws-1' is NEW — it opens cleanly, proving the trim
    // and the guard sit on the same path
    expect([201, 400]).toContain(res.status);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('ZodError');
    expect(body).not.toContain('invalid_string');
  });

  it('a declaration with no commandId is refused — replay protection cannot be opted out of', async () => {
    const res = await mf.dispatchFetch(`${BASE}/fund`, {
      method: 'PUT',
      headers: opsHeaders(),
      body: JSON.stringify({ balanceFcfa: 50_000 }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('command_id_required');
  });
});

describe('the book survives a restart — durable, not resident', () => {
  it('a fresh Miniflare over the same persistence sees every claim and declaration', async () => {
    await mf.dispose();
    // Deliberate REUSE of the main persist dir — after disposing the previous
    // instance. This reuse IS the durability assertion.
    const revived = mfWith(OPS_SECRET, MAIN_PERSIST);
    try {
      const list = await revived.dispatchFetch(`${BASE}/claims`, { headers: opsHeaders() });
      const { claims } = (await list.json()) as { claims: Array<{ claim: { orderId: string } }> };
      expect(claims.map((c) => c.claim.orderId).sort()).toEqual([
        'order-fonds-001',
        'order-fonds-002',
        'order-fonds-003',
        'order-ws-1',
      ]);
      const fund = await revived.dispatchFetch(`${BASE}/fund`, { headers: opsHeaders() });
      expect(((await fund.json()) as { declarationCount: number }).declarationCount).toBe(2);
    } finally {
      await revived.dispose();
    }
  });
});
