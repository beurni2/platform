import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { TERMINAL_CLAIM_STATES, computeCommittedClaimsAmount, deriveSolvency } from '../src/fund-core.js';
import { bundle, freshPersistDir, openBook, writeDays, type Book } from './fixtures/book.js';

/**
 * THE RUNNING TOTAL IS NEVER A SECOND FORMULA. Generated sequences of opens,
 * forward steps, closes and declarations (fixed seeds, several hundred steps)
 * on real workerd: after EVERY step the summary's committed amount equals the
 * policy function over the full claims list, its solvency equals the same
 * derivation from the latest declaration, and the open index holds exactly
 * the claims that are not terminal. Once from an empty book, and once from a
 * book the previous release wrote and this release upgraded.
 */

const here = import.meta.dirname;
let mainScript: string;
let thisScript: string;

beforeAll(async () => {
  mainScript = await bundle(join(here, 'fixtures/counting-entry-main.ts'), 'main-ae0b76e');
  thisScript = await bundle(join(here, 'fixtures/counting-entry.ts'), 'this-release');
}, 60_000);

/** mulberry32 — a fixed-seed generator, so every run replays the same book. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAULTS = ['seller', 'buyer', 'payment_provider', 'platform_system', 'unresolved'] as const;
type Stored = { claim: { orderId: string; state: string; amount: number; faultClass: string } };

async function expectBookAgrees(book: Book, step: string): Promise<void> {
  const full = (await book.json<{ claims: Stored[] }>('GET', '/claims')).claims.map((c) => c.claim);
  const fund = await book.json<{
    committedClaimsAmountFcfa: number;
    declaration: { balanceFcfa: number } | null;
    solvency: unknown;
  }>('GET', '/fund');
  const committed = computeCommittedClaimsAmount(full);
  expect(fund.committedClaimsAmountFcfa, step).toBe(committed);
  expect(fund.solvency, step).toEqual(deriveSolvency(fund.declaration?.balanceFcfa ?? null, committed));
  const open = (await book.json<{ claims: Stored[] }>('GET', '/claims?part=open')).claims.map((c) => c.claim.orderId);
  expect(open, step).toEqual(
    full.filter((c) => !(TERMINAL_CLAIM_STATES as readonly string[]).includes(c.state)).map((c) => c.orderId),
  );
}

async function walk(book: Book, seed: number, steps: number): Promise<void> {
  const next = rng(seed);
  const live: Array<{ id: string; state: string }> = [];
  for (let s = 0; s < steps; s += 1) {
    const roll = next();
    let label: string;
    if (roll < 0.4 || live.length === 0) {
      const id = `order-s${seed}-${s}`;
      const res = await book.call('POST', '/claims', {
        orderId: id,
        reason: 'commande en defaut',
        faultClass: FAULTS[Math.floor(next() * FAULTS.length)],
        amountFcfa: 500 + Math.floor(next() * 50_000),
        evidenceBundleId: `evb-${id}`,
      });
      expect(res.status, `open ${id}`).toBe(201);
      live.push({ id, state: 'opened' });
      label = `open ${id}`;
    } else if (roll < 0.85) {
      const i = Math.floor(next() * live.length);
      const c = live[i] as { id: string; state: string };
      const pick = next();
      const to =
        c.state === 'opened' ? (pick < 0.6 ? 'under_review' : 'closed_no_payout') : pick < 0.6 ? 'resolved' : 'closed_no_payout';
      const res = await book.call('POST', `/claims/${c.id}/advance`, {
        to,
        ...(to === 'resolved' ? { settlementRef: `momo-${c.id}` } : {}),
        ...(to === 'closed_no_payout' ? { closedReason: 'rien du par le fonds' } : {}),
      });
      expect(res.status, `${c.id} → ${to}`).toBe(200);
      if (to === 'under_review') c.state = to;
      else live.splice(i, 1);
      label = `${c.id} → ${to}`;
    } else {
      const res = await book.call('PUT', '/fund', { commandId: `decl-s${seed}-${s}`, balanceFcfa: Math.floor(next() * 200_000) });
      expect(res.status, `declare at ${s}`).toBe(201);
      label = `declare at ${s}`;
    }
    await expectBookAgrees(book, `seed ${seed}, step ${s}: ${label}`);
  }
}

describe('the running total equals the full recomputation after every step', () => {
  for (const seed of [11, 23, 47]) {
    it(
      `seed ${seed}: 300 steps from an empty book`,
      async () => {
        const book = openBook(thisScript, freshPersistDir(`total-${seed}`));
        try {
          await walk(book, seed, 300);
        } finally {
          await book.dispose();
        }
      },
      120_000,
    );
  }

  it(
    'seed 89: 300 steps on a book the previous release wrote, upgraded on its first reading',
    async () => {
      const dir = freshPersistDir('total-upgraded');
      const old = openBook(mainScript, dir);
      await writeDays(old, 0, 3);
      await old.dispose();
      const book = openBook(thisScript, dir);
      try {
        await expectBookAgrees(book, 'right after the upgrade');
        await walk(book, 89, 300);
      } finally {
        await book.dispose();
      }
    },
    120_000,
  );
});
