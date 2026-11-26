import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { TERMINAL_CLAIM_STATES } from '../src/fund-core.js';
import { bundle, freshPersistDir, openBook, writeDays, type Book } from './fixtures/book.js';

/**
 * THE CLAIMS LIST AND THE JOURNAL READ ONLY WHAT THE DESK SHOWS. On real
 * workerd: every open claim in one answer; closed claims in pages, most
 * recently closed first, each page reading only its page; the journal paged
 * the same way; the full answers unchanged for a desk that has not moved.
 */

const here = import.meta.dirname;
let book: Book;

beforeAll(async () => {
  const script = await bundle(join(here, 'fixtures/counting-entry.ts'), 'this-release');
  book = openBook(script, freshPersistDir('paging'));
  await writeDays(book, 0, 5); // 50 claims, 30 of them closed
  return () => book.dispose();
}, 120_000);

type Stored = { claim: { orderId: string; state: string } };
type Page = { claims: Stored[]; nextBefore: number | null };
type JournalPage = { journal: Array<{ seq: number }>; nextBefore: number | null };

const isTerminal = (s: string) => (TERMINAL_CLAIM_STATES as readonly string[]).includes(s);

describe('claims: every open claim at once, closed claims in pages', () => {
  it('every claim appears exactly once across the open set and the closed pages; no open claim on a page', async () => {
    const full = (await book.json<{ claims: Stored[] }>('GET', '/claims')).claims;
    const open = await book.json<{ claims: Stored[] }>('GET', '/claims?part=open');
    expect(Object.keys(open)).toEqual(['claims']);
    expect(open.claims.map((c) => c.claim.orderId)).toEqual(
      full.filter((c) => !isTerminal(c.claim.state)).map((c) => c.claim.orderId),
    );

    const pages: Page[] = [];
    let before: number | null = null;
    do {
      const page: Page = await book.json<Page>('GET', `/claims?part=closed&limit=7${before === null ? '' : `&before=${before}`}`);
      expect(Object.keys(page)).toEqual(['claims', 'nextBefore']);
      expect(page.claims.length).toBeLessThanOrEqual(7);
      for (const c of page.claims) expect(isTerminal(c.claim.state)).toBe(true);
      pages.push(page);
      before = page.nextBefore;
    } while (before !== null);
    expect(pages.map((p) => p.claims.length)).toEqual([7, 7, 7, 7, 2]);

    const closedIds = pages.flatMap((p) => p.claims.map((c) => c.claim.orderId));
    const everyId = [...open.claims.map((c) => c.claim.orderId), ...closedIds];
    expect(new Set(everyId).size).toBe(everyId.length);
    expect([...everyId].sort()).toEqual(full.map((c) => c.claim.orderId).sort());
  }, 60_000);

  it('closed pages are most recently closed first', async () => {
    // The last claims closed by writeDays are day 4's three no-payout closes, in order 4, 5, 6.
    const first = await book.json<Page>('GET', '/claims?part=closed&limit=3');
    expect(first.claims.map((c) => c.claim.orderId)).toEqual(['order-d0004-6', 'order-d0004-5', 'order-d0004-4']);
    const next = await book.json<Page>('GET', `/claims?part=closed&limit=3&before=${first.nextBefore}`);
    expect(next.claims.map((c) => c.claim.orderId)).toEqual(['order-d0004-2', 'order-d0004-1', 'order-d0004-0']);
  }, 60_000);

  it('the default page is 20, and a page read touches only its page', async () => {
    await book.resetTally();
    const page = await book.json<Page>('GET', '/claims?part=closed');
    expect(page.claims).toHaveLength(20);
    const tally = await book.tally();
    expect(tally.lists.filter((l) => l.prefix === 'claim:')).toEqual([]);
    expect(tally.valuesRead).toBeLessThanOrEqual(20 * 2 + 1); // its index rows, its claims, the indexed mark
  }, 60_000);

  it('a claim reaching a terminal state leaves the open set and heads the closed pages', async () => {
    expect((await book.call('POST', '/claims/order-d0004-3/advance', { to: 'closed_no_payout', closedReason: 'dossier de garde Sera' })).status).toBe(200);
    const open = await book.json<{ claims: Stored[] }>('GET', '/claims?part=open');
    expect(open.claims.map((c) => c.claim.orderId)).not.toContain('order-d0004-3');
    const first = await book.json<Page>('GET', '/claims?part=closed&limit=1');
    expect(first.claims.map((c) => c.claim.orderId)).toEqual(['order-d0004-3']);
  }, 60_000);

  it.each([
    'part=all',
    'part=closed&limit=0',
    'part=closed&limit=101',
    'part=closed&limit=1e1',
    'part=closed&before=0',
    'part=closed&before=-3',
    'part=closed&before=abc',
    'part=open&limit=5',
    'part=open&before=5',
  ])('a malformed page request is refused by name: %s', async (query) => {
    const res = await book.call('GET', `/claims?${query}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_page' });
  }, 60_000);
});

describe('the journal pages the same way', () => {
  it('newest first; the pages, reversed and joined, are the full journal; a page reads only its page', async () => {
    const full = (await book.json<{ journal: Array<{ seq: number }> }>('GET', '/journal')).journal;
    const pages: JournalPage[] = [];
    let before: number | null = null;
    do {
      const page: JournalPage = await book.json<JournalPage>('GET', `/journal?limit=50${before === null ? '' : `&before=${before}`}`);
      expect(Object.keys(page)).toEqual(['journal', 'nextBefore']);
      pages.push(page);
      before = page.nextBefore;
    } while (before !== null);
    const joined = pages.flatMap((p) => p.journal);
    expect(joined.map((r) => r.seq)).toEqual([...full].reverse().map((r) => r.seq));
    expect(joined).toEqual([...full].reverse());

    await book.resetTally();
    const one = await book.json<JournalPage>('GET', '/journal?limit=5');
    expect(one.journal.map((r) => r.seq)).toEqual(full.slice(-5).reverse().map((r) => r.seq));
    expect((await book.tally()).valuesRead).toBe(5);
  }, 60_000);

  it.each(['limit=0', 'limit=101', 'limit=x', 'before=0', 'before=1.5'])('a malformed journal page is refused by name: %s', async (query) => {
    const res = await book.call('GET', `/journal?${query}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_page' });
  }, 60_000);
});
