import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The console's OWN port, unmodified — the seam under test. Imported by path:
// miniflare lives in this package only, so the seam test lives here too.
import { HttpFondsPort } from '../../../apps/ops-console/src/fonds/http.js';

/**
 * THE FUND DESK SEAM, END TO END (CLAUDE.md §6bis: « Drive the app's OWN ports
 * against the REAL service (miniflare) »). The ops console's HttpFondsPort
 * talks over real HTTP to the real protection-service bundle on workerd —
 * nothing in between is stubbed, and globalThis.fetch is the real one. The
 * outcome is asked of the service's own /claims and /journal reads, never
 * taken from the port's answer alone.
 */

const OPS_SECRET = 'test-fonds-seam-secret-0001';
let mf: Miniflare;
let base: string;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/worker/worker.mjs',
    durableObjects: { FONDS: 'FondsDO' },
    bindings: { PROTECTION_OPS_SECRET: OPS_SECRET },
    host: '127.0.0.1',
    port: 0,
  });
  base = (await mf.ready).origin;
});

afterAll(async () => {
  await mf.dispose();
});

async function ledger<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${OPS_SECRET}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

describe('the console fund port against the real protection service', () => {
  it('declare → open → review → resolve with the payment reference → load, and the book agrees', async () => {
    const port = new HttpFondsPort(base, OPS_SECRET);

    expect(
      await port.declare({ commandId: 'seam-decl-1', balanceFcfa: 50_000, openingFundCapitalFcfa: 50_000 }),
    ).toEqual({ ok: true });
    expect(
      await port.openClaim({
        orderId: 'order-seam-001',
        reason: 'jamais prete — commande annulee',
        faultClass: 'seller',
        amountFcfa: 12_500,
        evidenceBundleId: 'evb-seam-001',
      }),
    ).toEqual({ ok: true });
    expect(await port.advance('order-seam-001', 'under_review')).toEqual({ ok: true });
    expect(await port.advance('order-seam-001', 'resolved', 'momo-tx-seam-001')).toEqual({ ok: true });

    const data = await port.load();
    expect(data.unrecognizedCount).toBe(0);
    expect(data.claims).toHaveLength(1);
    expect(data.claims[0]).toMatchObject({
      orderId: 'order-seam-001',
      state: 'resolved',
      amountFcfa: 12_500,
      settlementRef: 'momo-tx-seam-001',
      refundRequired: true,
    });
    expect(data.fund).toMatchObject({
      balanceFcfa: 50_000,
      openingFundCapitalFcfa: 50_000,
      declarationCount: 1,
      committedClaimsAmountFcfa: 0, // resolved is terminal: nothing still committed
    });

    // The ledger's own word, not the port's.
    const { claims } = await ledger<{
      claims: Array<{ claim: { orderId: string; state: string; amount: number }; advanced: Array<{ to: string; settlementRef?: string }> }>;
    }>('/claims');
    expect(claims).toHaveLength(1);
    expect(claims[0]?.claim).toMatchObject({ orderId: 'order-seam-001', state: 'resolved', amount: 12_500 });
    expect(claims[0]?.advanced.map((a) => a.to)).toEqual(['under_review', 'resolved']);
    expect(claims[0]?.advanced.at(-1)?.settlementRef).toBe('momo-tx-seam-001');

    const { journal } = await ledger<{ journal: Array<{ action: string; entity: string; detail: Record<string, unknown> }> }>(
      '/journal',
    );
    expect(journal.map((r) => r.action)).toEqual([
      'fund:declare',
      'protection.capitalized.v1',
      'protection.solvency_changed.v1',
      'protection.claim_opened.v1',
      'claim:advance',
      'claim:advance',
    ]);
    expect(journal.at(-1)?.detail).toMatchObject({ from: 'under_review', to: 'resolved', settlementRef: 'momo-tx-seam-001' });
  });

  it('load shows every open claim and the latest 20 closed; « see older » brings the rest; the book agrees', async () => {
    const port = new HttpFondsPort(base, OPS_SECRET);
    for (let i = 0; i < 23; i += 1) {
      const orderId = `order-seam-page-${String(i).padStart(2, '0')}`;
      expect(
        await port.openClaim({ orderId, reason: 'colis jamais pret', faultClass: 'buyer', amountFcfa: 2_000, evidenceBundleId: `evb-${orderId}` }),
      ).toEqual({ ok: true });
      if (i < 21) expect(await port.advance(orderId, 'closed_no_payout', 'la cliente a renonce')).toEqual({ ok: true });
    }

    const data = await port.load();
    const { claims } = await ledger<{ claims: Array<{ claim: { orderId: string; state: string } }> }>('/claims');
    const terminal = (s: string) => s === 'resolved' || s === 'closed_no_payout';
    const openInBook = claims.filter((c) => !terminal(c.claim.state)).map((c) => c.claim.orderId);
    expect(openInBook).toEqual(['order-seam-page-21', 'order-seam-page-22']);
    // Every open claim on the first view; then the 20 most recently closed.
    expect(data.claims.filter((c) => !terminal(c.state)).map((c) => c.orderId)).toEqual(openInBook);
    const firstClosed = data.claims.filter((c) => terminal(c.state)).map((c) => c.orderId);
    expect(firstClosed).toHaveLength(20);
    expect(firstClosed[0]).toBe('order-seam-page-20');
    expect(data.closedBefore).not.toBeNull();

    const older = await port.loadOlderClosed(data.closedBefore as number);
    expect(older.closedBefore).toBeNull();
    expect(older.unrecognizedCount).toBe(0);
    const shown = [...data.claims, ...older.claims].map((c) => c.orderId);
    expect(new Set(shown).size).toBe(shown.length);
    expect([...shown].sort()).toEqual(claims.map((c) => c.claim.orderId).sort());
  }, 60_000);

  it('a wrong key through the port is refused by the service, and load says unauthorized', async () => {
    const port = new HttpFondsPort(base, 'not-the-secret');
    await expect(port.load()).rejects.toThrow('unauthorized');
    expect(await port.declare({ commandId: 'seam-decl-bad', balanceFcfa: 1 })).toEqual({
      ok: false,
      error: 'unauthorized',
    });
  });
});
