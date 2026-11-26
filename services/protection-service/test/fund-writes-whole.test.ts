import { describe, expect, it } from 'vitest';
import { FondsDO } from '../worker/fund-do.js';

/**
 * EVERY FUND WRITE LANDS WHOLE WITH ITS HISTORY (§9.1 « every ops action is a
 * permissioned, evented, audited command »; §9.2 Desk 8 « Append-only »).
 *
 * A storage write can fail at any boundary, and the object can be reloaded
 * with nothing but what reached storage. For create, advance and declare,
 * this suite fails the write at EVERY put the action makes, reloads a fresh
 * FondsDO over what survived, retries the very same command, and asks the
 * book's own read routes whether it is whole: the action's effect exactly
 * once, every effect with its journal row, journal and declaration sequences
 * contiguous with nothing overwritten.
 *
 * ═══ THE STORAGE STAND-IN — ITS BOUNDS (never kinder than real storage) ═══
 *  · Values are structured-cloned on every write and every read: nothing the
 *    object keeps in memory survives a reload, and no reference is shared.
 *  · `list({ prefix })` returns keys in sorted order, as real storage does.
 *  · A multi-key `put({...})` is all-or-nothing (real storage's documented
 *    atomic batch, at most 128 keys) — the ONLY atomicity it grants.
 *  · Each single-key `put` is committed the moment it is called. Real storage
 *    may coalesce consecutive writes; this stand-in never does, so it is
 *    HARSHER: a failure can land between any two awaited puts.
 *  · An injected failure throws BEFORE the failing put applies anything.
 */
class StrictStorage {
  readonly data = new Map<string, unknown>();
  putCalls = 0;
  failAtPut: number | null = null;

  async get(key: string | string[]): Promise<unknown> {
    if (Array.isArray(key)) {
      const out = new Map<string, unknown>();
      for (const k of key) if (this.data.has(k)) out.set(k, structuredClone(this.data.get(k)));
      return out;
    }
    const v = this.data.get(key);
    return v === undefined ? undefined : structuredClone(v);
  }

  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    this.putCalls += 1;
    if (this.failAtPut !== null && this.putCalls === this.failAtPut) {
      throw new Error('injected storage write failure');
    }
    if (typeof keyOrEntries === 'string') {
      this.data.set(keyOrEntries, structuredClone(value));
      return;
    }
    const entries = Object.entries(keyOrEntries);
    if (entries.length > 128) throw new Error('a batch put takes at most 128 keys');
    const cloned = entries.map(([k, v]) => [k, structuredClone(v)] as const);
    for (const [k, v] of cloned) this.data.set(k, v);
  }

  async list(options: { prefix?: string } = {}): Promise<Map<string, unknown>> {
    const prefix = options.prefix ?? '';
    const keys = [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
    return new Map(keys.map((k) => [k, structuredClone(this.data.get(k))]));
  }
}

const BASE = 'http://fonds.local';

function bookOver(storage: StrictStorage): FondsDO {
  return new FondsDO({ storage } as unknown as DurableObjectState);
}

function call(book: FondsDO, method: string, path: string, body?: unknown): Promise<Response> {
  return book.fetch(
    new Request(`${BASE}${path}`, {
      method,
      ...(body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    }),
  );
}

interface Snapshot {
  claims: Array<{ claim: { orderId: string; state: string }; advanced: unknown[]; refundRequired?: unknown }>;
  journal: Array<{ seq: number; action: string; entity: string }>;
  fund: { declarationCount: number; solvency: unknown };
  declSeqs: number[];
}

/** The book as its OWN read routes see it, from a fresh reload. */
async function snapshot(storage: StrictStorage): Promise<Snapshot> {
  const book = bookOver(storage);
  const claims = ((await (await call(book, 'GET', '/claims')).json()) as { claims: Snapshot['claims'] }).claims;
  const journal = ((await (await call(book, 'GET', '/journal')).json()) as { journal: Snapshot['journal'] })
    .journal;
  const fund = (await (await call(book, 'GET', '/fund')).json()) as Snapshot['fund'];
  const decls = await storage.list({ prefix: 'decl:' });
  const declSeqs = [...decls.values()].map((d) => (d as { seq: number }).seq);
  return { claims, journal, fund, declSeqs };
}

/** Whole: every effect has its history, and no sequence row is lost or reused. */
function expectWhole(s: Snapshot, storage: StrictStorage): void {
  expect(s.journal.map((r) => r.seq)).toEqual(s.journal.map((_, i) => i + 1));
  expect(storage.data.get('seq:journal') ?? 0).toBe(s.journal.length);
  expect(s.declSeqs).toEqual(s.declSeqs.map((_, i) => i + 1));
  expect(storage.data.get('seq:decl') ?? 0).toBe(s.declSeqs.length);
  expect(s.fund.declarationCount).toBe(s.journal.filter((r) => r.action === 'fund:declare').length);
  for (const c of s.claims) {
    const id = c.claim.orderId;
    expect(s.journal.filter((r) => r.action === 'protection.claim_opened.v1' && r.entity === id)).toHaveLength(1);
    expect(s.journal.filter((r) => r.action === 'claim:advance' && r.entity === id)).toHaveLength(c.advanced.length);
  }
  const consumed = [...storage.data.keys()].filter((k) => k.startsWith('consumed:'));
  expect(consumed).toHaveLength(s.declSeqs.length);
}

const SEED_DECLARATION = { commandId: 'seed-decl-1', balanceFcfa: 40_000 };
const CLAIM = {
  orderId: 'order-whole-001',
  reason: 'jamais prete — commande annulee',
  faultClass: 'seller',
  amountFcfa: 12_500,
  evidenceBundleId: 'evb-whole-001',
};
const DECLARATION = { commandId: 'decl-whole-1', balanceFcfa: 5_000, openingFundCapitalFcfa: 5_000 };

interface Action {
  readonly name: string;
  readonly seed: (book: FondsDO) => Promise<void>;
  readonly run: (book: FondsDO) => Promise<Response>;
  readonly okStatus: number;
  readonly landedOnce: (s: Snapshot) => void;
}

const ACTIONS: readonly Action[] = [
  {
    name: 'opening a claim',
    seed: async (book) => {
      expect((await call(book, 'PUT', '/fund', SEED_DECLARATION)).status).toBe(201);
    },
    run: (book) => call(book, 'POST', '/claims', CLAIM),
    okStatus: 201,
    landedOnce: (s) => {
      expect(s.claims.map((c) => c.claim.orderId)).toEqual([CLAIM.orderId]);
      // B+I-13: the seller-fault refund record lands WITH the claim, always.
      expect(s.claims[0]?.refundRequired).toMatchObject({ buyerPriority: true, amountFcfa: 12_500 });
    },
  },
  {
    name: 'advancing a claim',
    seed: async (book) => {
      expect((await call(book, 'PUT', '/fund', SEED_DECLARATION)).status).toBe(201);
      expect((await call(book, 'POST', '/claims', CLAIM)).status).toBe(201);
    },
    run: (book) => call(book, 'POST', `/claims/${CLAIM.orderId}/advance`, { to: 'under_review' }),
    okStatus: 200,
    landedOnce: (s) => {
      expect(s.claims[0]?.claim.state).toBe('under_review');
      expect(s.claims[0]?.advanced).toHaveLength(1);
    },
  },
  {
    name: 'declaring the fund balance',
    seed: async (book) => {
      // An open seller claim, so the declaration also moves solvency and
      // writes every row a declaration can write.
      expect((await call(book, 'POST', '/claims', CLAIM)).status).toBe(201);
    },
    run: (book) => call(book, 'PUT', '/fund', DECLARATION),
    okStatus: 201,
    landedOnce: (s) => {
      expect(s.declSeqs).toEqual([1]);
      expect(s.journal.filter((r) => r.action === 'fund:declare')).toHaveLength(1);
      expect(s.journal.filter((r) => r.action === 'protection.capitalized.v1')).toHaveLength(1);
      expect(s.journal.filter((r) => r.action === 'protection.solvency_changed.v1')).toHaveLength(1);
    },
  },
];

/** How many puts the action makes on a clean run — every one is a boundary. */
async function putsOf(action: Action): Promise<number> {
  const storage = new StrictStorage();
  await action.seed(bookOver(storage));
  const before = storage.putCalls;
  expect((await action.run(bookOver(storage))).status).toBe(action.okStatus);
  return storage.putCalls - before;
}

describe('every fund write lands whole with its history — a failure at any write boundary, reload, retry', () => {
  for (const action of ACTIONS) {
    it(`${action.name}: at every boundary the retry ends with the change exactly once, with its journal`, async () => {
      const boundaries = await putsOf(action);
      expect(boundaries).toBeGreaterThan(0);
      for (let k = 1; k <= boundaries; k += 1) {
        const storage = new StrictStorage();
        await action.seed(bookOver(storage));
        const pre = await snapshot(storage);

        storage.failAtPut = storage.putCalls + k;
        await expect(action.run(bookOver(storage)), `boundary ${k}`).rejects.toThrow('injected');
        storage.failAtPut = null;

        // After the failure and a reload: no change at all, or the whole change.
        const mid = await snapshot(storage);
        expectWhole(mid, storage);
        const unchanged = JSON.stringify(mid) === JSON.stringify(pre);

        const retry = await action.run(bookOver(storage));
        if (unchanged) expect(retry.status, `boundary ${k}: retry of an unchanged book`).toBe(action.okStatus);

        const after = await snapshot(storage);
        expectWhole(after, storage);
        action.landedOnce(after);
      }
    });
  }

  it('the solvency a declaration answers is the solvency the book then reads back', async () => {
    const storage = new StrictStorage();
    expect((await call(bookOver(storage), 'POST', '/claims', CLAIM)).status).toBe(201);
    const declared = (await (await call(bookOver(storage), 'PUT', '/fund', DECLARATION)).json()) as {
      solvency: unknown;
    };
    const read = (await (await call(bookOver(storage), 'GET', '/fund')).json()) as { solvency: unknown };
    expect(declared.solvency).toEqual(read.solvency);
    expect((read.solvency as { state: string }).state).toBe('CRITICAL'); // 5 000 declared < 12 500 committed
  });
});
