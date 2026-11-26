/**
 * TEST-ONLY helpers shared by the fund book's history tests: bundle an entry
 * the way the package script does, start it on real workerd over a persisted
 * directory, and write a book shaped like N typical days.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import type { OpsTally } from './counting.js';

export const OPS_SECRET = 'test-fonds-history-secret-0001';
const BASE = 'http://fonds.local';
// Under the package (workerd resolves modules below its working directory),
// inside the git-ignored dist/.
const outDir = join(import.meta.dirname, '..', '..', 'dist', 'test-bundles');

/** The same esbuild flags as the package's bundle:worker script. */
export async function bundle(entry: string, name: string): Promise<string> {
  // A file of its own per call: test files run in parallel and must never
  // read a bundle another one is rewriting.
  const outfile = join(outDir, `${name}-${crypto.randomUUID()}.mjs`);
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    conditions: ['import'],
    outfile,
    define: { __PLATFORM_RELEASE__: "'dev'", __PLATFORM_CANON__: "'dev'" },
    logLevel: 'silent',
  });
  return outfile;
}

export function freshPersistDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `fonds-${label}-`));
}

export interface Book {
  call(method: string, path: string, body?: unknown): Promise<Response>;
  json<T>(method: string, path: string, body?: unknown): Promise<T>;
  text(path: string): Promise<string>;
  tally(): Promise<OpsTally>;
  resetTally(): Promise<void>;
  raw<T>(op: 'get' | 'put' | 'list', args: { key?: string; value?: unknown; prefix?: string }): Promise<T>;
  dispose(): Promise<void>;
}

export function openBook(scriptPath: string, persistDir: string): Book {
  const mf = new Miniflare({
    modules: true,
    scriptPath,
    durableObjects: { FONDS: 'FondsDO' },
    durableObjectsPersist: persistDir,
    bindings: { PROTECTION_OPS_SECRET: OPS_SECRET },
  });
  const call = (method: string, path: string, body?: unknown) =>
    mf.dispatchFetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }) as unknown as Promise<Response>;
  return {
    call,
    json: async <T>(method: string, path: string, body?: unknown) => (await (await call(method, path, body)).json()) as T,
    text: async (path: string) => (await call('GET', path)).text(),
    tally: async () => (await (await call('GET', '/__ops')).json()) as OpsTally,
    resetTally: async () => {
      await call('POST', '/__ops/reset');
    },
    raw: async <T>(op: 'get' | 'put' | 'list', args: { key?: string; value?: unknown; prefix?: string }) =>
      (await (await call('POST', '/__raw', { op, ...args })).json()) as T,
    dispose: () => mf.dispose(),
  };
}

const FAULTS = ['seller', 'buyer', 'payment_provider', 'platform_system', 'unresolved'] as const;

async function expectStatus(res: Promise<Response>, status: number, what: string): Promise<void> {
  const r = await res;
  if (r.status !== status) throw new Error(`${what}: expected ${status}, got ${r.status} ${await r.text()}`);
}

/**
 * A typical pilot day: 10 claims opened, 10 steps (4 to review, 3 of those
 * resolved against an offline payment reference, 3 closed without payout),
 * 3 balance declarations. Six of the ten end closed.
 */
export async function writeDays(book: Book, fromDay: number, days: number): Promise<void> {
  for (let d = fromDay; d < fromDay + days; d += 1) {
    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const orderId = `order-d${String(d).padStart(4, '0')}-${i}`;
      ids.push(orderId);
      await expectStatus(
        book.call('POST', '/claims', {
          orderId,
          reason: 'jamais prete — commande annulee',
          faultClass: FAULTS[(d + i) % FAULTS.length],
          amountFcfa: 1_000 * (i + 1) + d,
          evidenceBundleId: `evb-${orderId}`,
        }),
        201,
        `open ${orderId}`,
      );
    }
    for (const id of ids.slice(0, 4)) await expectStatus(book.call('POST', `/claims/${id}/advance`, { to: 'under_review' }), 200, `review ${id}`);
    for (const id of ids.slice(0, 3)) {
      await expectStatus(book.call('POST', `/claims/${id}/advance`, { to: 'resolved', settlementRef: `momo-${id}` }), 200, `resolve ${id}`);
    }
    for (const id of ids.slice(4, 7)) {
      await expectStatus(book.call('POST', `/claims/${id}/advance`, { to: 'closed_no_payout', closedReason: 'la cliente a renonce' }), 200, `close ${id}`);
    }
    for (let k = 0; k < 3; k += 1) {
      await expectStatus(
        book.call('PUT', '/fund', {
          commandId: `decl-d${d}-${k}`,
          balanceFcfa: 40_000 + 1_000 * k + d,
          ...(d === 0 && k === 0 ? { openingFundCapitalFcfa: 40_000 } : {}),
        }),
        201,
        `declare d${d}-${k}`,
      );
    }
  }
}
