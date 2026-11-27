import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { bundle, freshPersistDir, openBook, writeDays } from './fixtures/book.js';

/**
 * THE FUND SUMMARY READS BOUNDED STATE. A book written by the previous
 * release (frozen main ae0b76e) at 10× and 100× a typical day, reopened by
 * this release over the same persisted storage on real workerd: GET /fund
 * answers the same bytes, and what one GET /fund reads from storage does not
 * grow with the history. Storage is counted through the test-only recording
 * window (fixtures/counting.ts) over the real storage; the book's code is
 * untouched.
 */

const here = import.meta.dirname;
let mainScript: string;
let thisScript: string;

beforeAll(async () => {
  mainScript = await bundle(join(here, 'fixtures/counting-entry-main.ts'), 'main-ae0b76e');
  thisScript = await bundle(join(here, 'fixtures/counting-entry.ts'), 'this-release');
}, 60_000);

interface Reading {
  mainBytes: string;
  thisBytes: string;
  firstView: { valuesRead: number; calls: Record<string, number> };
  everydayView: { valuesRead: number; calls: Record<string, number> };
}

async function readAtScale(days: number): Promise<Reading> {
  const dir = freshPersistDir(`bounded-${days}`);
  const written = openBook(mainScript, dir);
  await writeDays(written, 0, days);
  const mainBytes = await written.text('/fund');
  await written.dispose();

  const reopened = openBook(thisScript, dir);
  try {
    await reopened.resetTally();
    const thisBytes = await reopened.text('/fund');
    const firstView = await reopened.tally();
    await reopened.resetTally();
    expect(await reopened.text('/fund')).toBe(thisBytes);
    const everydayView = await reopened.tally();
    return {
      mainBytes,
      thisBytes,
      firstView: { valuesRead: firstView.valuesRead, calls: firstView.calls },
      everydayView: { valuesRead: everydayView.valuesRead, calls: everydayView.calls },
    };
  } finally {
    await reopened.dispose();
  }
}

describe('GET /fund reads bounded state — same bytes, flat cost, at 10× and 100× a typical day', () => {
  it(
    'the answer is byte-identical to the previous release, and an everyday view reads the same at 10× and 100×',
    async () => {
      const ten = await readAtScale(10);
      const hundred = await readAtScale(100);

      expect(ten.thisBytes).toBe(ten.mainBytes);
      expect(hundred.thisBytes).toBe(hundred.mainBytes);

      // The everyday view: no list at all, and the same storage work whatever the history.
      expect(hundred.everydayView.calls).toEqual(ten.everydayView.calls);
      expect(hundred.everydayView.valuesRead).toBe(ten.everydayView.valuesRead);
      expect(Object.keys(hundred.everydayView.calls).filter((c) => c.includes('list'))).toEqual([]);
      // The latest declaration, the total, and the two counters it is checked against.
      expect(hundred.everydayView.valuesRead).toBeLessThanOrEqual(4);
    },
    180_000,
  );
});
