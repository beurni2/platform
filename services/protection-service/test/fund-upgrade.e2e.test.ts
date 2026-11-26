import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FUND_COMMITMENT_POLICY_V1,
  TERMINAL_CLAIM_STATES,
  computeCommittedClaimsAmount,
} from '../src/fund-core.js';
import { bundle, freshPersistDir, openBook, writeDays, type Book } from './fixtures/book.js';

/**
 * A BOOK WRITTEN BEFORE THIS RELEASE GETS ITS RUNNING TOTAL AND INDEXES ONCE.
 * The frozen main ae0b76e code writes a book into persisted storage; this
 * release reopens the very same storage on real workerd. Its first reading
 * builds the total and the open/closed indexes from the rows, once, writes
 * one record of what the build did, and answers exactly what main answered;
 * every later reading lists nothing. No history row is edited or deleted.
 */

const here = import.meta.dirname;
let mainScript: string;
let thisScript: string;

beforeAll(async () => {
  mainScript = await bundle(join(here, 'fixtures/counting-entry-main.ts'), 'main-ae0b76e');
  thisScript = await bundle(join(here, 'fixtures/counting-entry.ts'), 'this-release');
}, 60_000);

type Claims = { claims: Array<{ claim: { orderId: string; state: string; amount: number; faultClass: string } }> };

function claimLists(lists: Array<{ prefix: string | null }>): number {
  return lists.filter((l) => l.prefix === 'claim:').length;
}

async function historyRows(book: Book): Promise<Record<string, unknown>> {
  const rows: Record<string, unknown> = {};
  for (const prefix of ['claim:', 'decl:', 'journal:', 'consumed:']) {
    Object.assign(rows, (await book.raw<{ rows: Record<string, unknown> }>('list', { prefix })).rows);
  }
  return rows;
}

describe('a book from the previous release is indexed once, then never again', () => {
  it(
    'first reading builds once and answers like main; later readings list nothing; no history row changes',
    async () => {
      const dir = freshPersistDir('upgrade');
      const old = openBook(mainScript, dir);
      await writeDays(old, 0, 3);
      const mainFund = await old.text('/fund');
      const mainClaims = await old.text('/claims');
      const mainJournal = await old.text('/journal');
      const before = await historyRows(old);
      await old.dispose();

      const book = openBook(thisScript, dir);
      try {
        await book.resetTally();
        expect(await book.text('/fund')).toBe(mainFund);
        expect(claimLists((await book.tally()).lists)).toBe(1); // the one-time build

        // The build's own record: when, and each counter before and after.
        const builds = (await book.raw<{ rows: Record<string, { reason: string; counters: unknown }> }>('list', { prefix: 'build:' }))
          .rows;
        expect(Object.values(builds)).toHaveLength(1);
        expect(Object.values(builds)[0]).toMatchObject({
          reason: 'no_total',
          counters: { 'seq:decl': { before: 9, after: 9 }, 'seq:journal': { before: expect.any(Number) } },
        });

        await book.resetTally();
        expect(await book.text('/fund')).toBe(mainFund);
        expect((await book.tally()).lists).toEqual([]);

        // The full answers old clients read are unchanged, and no history row moved.
        expect(await book.text('/claims')).toBe(mainClaims);
        expect(await book.text('/journal')).toBe(mainJournal);
        expect(await historyRows(book)).toEqual(before);

        // The indexes agree with the claims' own states.
        const full = (JSON.parse(mainClaims) as Claims).claims;
        const open = (await book.json<Claims>('GET', '/claims?part=open')).claims;
        expect(open.map((c) => c.claim.orderId)).toEqual(
          full.filter((c) => !(TERMINAL_CLAIM_STATES as readonly string[]).includes(c.claim.state)).map((c) => c.claim.orderId),
        );
        const closed = await book.json<Claims & { nextBefore: number | null }>('GET', '/claims?part=closed&limit=100');
        expect(closed.nextBefore).toBeNull();
        expect(closed.claims.map((c) => c.claim.orderId).sort()).toEqual(
          full.filter((c) => (TERMINAL_CLAIM_STATES as readonly string[]).includes(c.claim.state)).map((c) => c.claim.orderId).sort(),
        );
      } finally {
        await book.dispose();
      }
    },
    120_000,
  );

  it(
    'a declaration or journal row left ahead of its counter by an older interrupted write: the counter is raised, the row kept, the correction recorded',
    async () => {
      const dir = freshPersistDir('upgrade-counters');
      const old = openBook(mainScript, dir);
      await writeDays(old, 0, 1);
      // As an interrupted pre-atomic write left it: the row landed, its counter did not.
      const seqDecl = (await old.raw<{ value: number }>('get', { key: 'seq:decl' })).value;
      const orphan = { seq: seqDecl + 1, balanceFcfa: 77_000, declaredAt: '2026-11-01T08:00:00.000Z', declaredBy: 'ops:protection:fondateur' };
      await old.raw('put', { key: `decl:${String(seqDecl + 1).padStart(8, '0')}`, value: orphan });
      const mainFund = await old.text('/fund');
      expect(JSON.parse(mainFund)).toMatchObject({ declaration: orphan, declarationCount: seqDecl + 1 });
      await old.dispose();

      const book = openBook(thisScript, dir);
      try {
        expect(await book.text('/fund')).toBe(mainFund);
        expect((await book.raw<{ value: number }>('get', { key: 'seq:decl' })).value).toBe(seqDecl + 1);
        const builds = Object.values(
          (await book.raw<{ rows: Record<string, { counters: Record<string, { before: number; after: number }> }> }>('list', { prefix: 'build:' })).rows,
        );
        expect(builds[0]?.counters['seq:decl']).toEqual({ before: seqDecl, after: seqDecl + 1 });

        // The next declaration takes the next number: the kept row is never overwritten.
        expect((await book.call('PUT', '/fund', { commandId: 'after-upgrade', balanceFcfa: 80_000 })).status).toBe(201);
        expect((await book.raw<{ value: unknown }>('get', { key: `decl:${String(seqDecl + 1).padStart(8, '0')}` })).value).toEqual(orphan);
        expect((await book.json<{ declarationCount: number }>('GET', '/fund')).declarationCount).toBe(seqDecl + 2);
      } finally {
        await book.dispose();
      }
    },
    120_000,
  );

  it(
    'a running total built under another commitment policy is rebuilt once, then answers like a full recomputation',
    async () => {
      const dir = freshPersistDir('upgrade-policy');
      const book = openBook(thisScript, dir);
      try {
        await writeDays(book, 0, 2);
        const stale = (await book.raw<{ value: Record<string, unknown> | null }>('get', { key: 'total:committed' })).value;
        expect(stale).toMatchObject({ policyVersion: FUND_COMMITMENT_POLICY_V1.version });
        await book.raw('put', {
          key: 'total:committed',
          value: { ...stale, amountFcfa: 1, policyVersion: 'fund-commitment-policy.v0' },
        });

        await book.resetTally();
        const fund = await book.json<{ committedClaimsAmountFcfa: number }>('GET', '/fund');
        const full = (await book.json<Claims>('GET', '/claims')).claims.map((c) => c.claim);
        expect(fund.committedClaimsAmountFcfa).toBe(computeCommittedClaimsAmount(full));
        expect(claimLists((await book.tally()).lists)).toBe(2); // the rebuild + the full list just read

        await book.resetTally();
        await book.json('GET', '/fund');
        expect((await book.tally()).lists).toEqual([]);
        const reasons = Object.values((await book.raw<{ rows: Record<string, { reason: string }> }>('list', { prefix: 'build:' })).rows).map((r) => r.reason);
        expect(reasons).toEqual(['no_total', 'policy_changed']);
      } finally {
        await book.dispose();
      }
    },
    120_000,
  );
});
