import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpFondsPort } from '../src/fonds/http';

/**
 * The fund desk's port reading the service's pages. Only globalThis.fetch is
 * faked, answering in the service's own wire shapes (services/protection-service
 * worker/fund-do.ts: GET /fund, GET /claims?part=open → { claims },
 * ?part=closed → { claims, nextBefore }; the previous release ignores `part`
 * and answers { claims } — the whole list — to both). The real-service proofs
 * are the seam test and the desk walk; this pins the two cases a live book
 * only reaches by timing.
 */

const BASE = 'http://fonds.test';

function stored(orderId: string, state: string) {
  return {
    claim: { orderId, reason: 'colis jamais pret', amount: 2_000, faultClass: 'buyer', evidenceBundleId: `evb-${orderId}`, state },
    openedAt: '2026-11-26T08:00:00.000Z',
    openedBy: 'ops:protection:fondateur',
    advanced: state === 'closed_no_payout' ? [{ to: state, at: '2026-11-26T09:00:00.000Z', by: 'ops:protection:fondateur', closedReason: 'la cliente a renonce' }] : [],
  };
}

const FUND = {
  declaration: null,
  declarationCount: 0,
  committedClaimsAmountFcfa: 0,
  solvency: { state: null, availableAfterCommitmentsFcfa: null },
  solvencyNote: '',
};

function serve(answers: Record<string, unknown>): void {
  vi.stubGlobal('fetch', async (input: string) => {
    const path = input.slice(BASE.length);
    if (!(path in answers)) throw new Error(`unexpected request ${path}`);
    return Response.json(answers[path]);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the fund port reads the open set and the first closed page', () => {
  it('a claim closed between the two reads appears once, as its closed copy', async () => {
    serve({
      '/fund': FUND,
      '/claims?part=open': { claims: [stored('order-a', 'opened'), stored('order-b', 'opened')] },
      '/claims?part=closed&limit=20': { claims: [stored('order-b', 'closed_no_payout'), stored('order-c', 'closed_no_payout')], nextBefore: null },
    });
    const data = await new HttpFondsPort(BASE, 'k').load();
    expect(data.claims.map((c) => [c.orderId, c.state])).toEqual([
      ['order-a', 'opened'],
      ['order-b', 'closed_no_payout'],
      ['order-c', 'closed_no_payout'],
    ]);
    expect(data.closedBefore).toBeNull();
    expect(data.unrecognizedCount).toBe(0);
  });

  it('the previous release ignores the page and answers the whole list: it is used once, with no older page', async () => {
    // One record in a state this desk does not know: counted once, never twice.
    const whole = { claims: [stored('order-a', 'opened'), stored('order-b', 'closed_no_payout'), stored('order-q', 'unknown_state')] };
    serve({ '/fund': FUND, '/claims?part=open': whole, '/claims?part=closed&limit=20': whole });
    const data = await new HttpFondsPort(BASE, 'k').load();
    expect(data.claims.map((c) => c.orderId)).toEqual(['order-a', 'order-b']);
    expect(data.unrecognizedCount).toBe(1);
    expect(data.closedBefore).toBeNull();
  });

  it('an older page with no cursor ends the pages', async () => {
    serve({ '/claims?part=closed&limit=20&before=21': { claims: [stored('order-z', 'closed_no_payout')] } });
    const page = await new HttpFondsPort(BASE, 'k').loadOlderClosed(21);
    expect(page.claims.map((c) => c.orderId)).toEqual(['order-z']);
    expect(page.closedBefore).toBeNull();
  });
});
