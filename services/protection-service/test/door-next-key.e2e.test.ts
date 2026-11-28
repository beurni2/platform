import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * A key change with no gap (Execution Contract §11, « key rotation … overlapping
 * windows »), on the REAL bundle under workerd.
 *
 * While `PROTECTION_OPS_SECRET_NEXT` is set, the value it holds opens exactly
 * what `PROTECTION_OPS_SECRET` opens — the same door, the same book, the same
 * answers — so the founder can put the new key in place, move the consoles to
 * it, then make it the only key, and no request is refused in between. Unset or
 * empty, it opens nothing. A refusal is still the one identical 401, and the
 * request's log line never says which of the two keys was presented.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = 'dist/worker/worker.mjs';
// The deployed date, read from the deploy's own file, as the request-log test does.
const COMPATIBILITY_DATE = /^compatibility_date = "([^"]+)"$/m.exec(readFileSync(join(HERE, '..', 'wrangler.toml'), 'utf8'))?.[1];
if (COMPATIBILITY_DATE === undefined) throw new Error('wrangler.toml names no compatibility_date');
const BASE = 'http://fonds.local';
const LIMIT = 60_000;
const WAIT_MS = 3_000;

const CURRENT = 'test-cle-actuelle-0001';
const NEXT = 'test-cle-suivante-0002';
const THIRD = 'test-cle-troisieme-0003';
const OTHER = 'test-cle-autre-0004';

type Line = Record<string, unknown>;

/** Everything workerd writes, on both pipes, kept whole. */
class Capture {
  text = '';
  readonly attach = (stdout: Readable, stderr: Readable): void => {
    for (const pipe of [stdout, stderr]) {
      pipe.on('data', (chunk: Buffer) => {
        this.text += chunk.toString('utf8');
      });
    }
  };
  requestLines(): Line[] {
    const out: Line[] = [];
    for (const raw of this.text.split('\n')) {
      const s = raw.trim();
      if (!s.startsWith('{')) continue;
      try {
        const v: unknown = JSON.parse(s);
        if (v !== null && typeof v === 'object' && !Array.isArray(v) && (v as Line).msg === 'request') out.push(v as Line);
      } catch {
        // workerd's own text is not ours to parse
      }
    }
    return out;
  }
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function onlyLineFor(cap: Capture, cid: string): Promise<Line> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline && !cap.requestLines().some((l) => l.correlation_id === cid)) await pause(25);
  await pause(150);
  const found = cap.requestLines().filter((l) => l.correlation_id === cid);
  expect(found, `exactly one request line for ${cid}`).toHaveLength(1);
  return found[0] as Line;
}

const started: Miniflare[] = [];
afterAll(async () => {
  await Promise.all(started.map((mf) => mf.dispose().catch(() => undefined)));
}, LIMIT);

/** One Worker with the given key bindings; each on its own book directory. */
function worker(keys: { current?: string; next?: string }, cap?: Capture): Miniflare {
  const bindings: Record<string, string> = {};
  if (keys.current !== undefined) bindings.PROTECTION_OPS_SECRET = keys.current;
  if (keys.next !== undefined) bindings.PROTECTION_OPS_SECRET_NEXT = keys.next;
  const mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    compatibilityDate: COMPATIBILITY_DATE,
    durableObjects: { FONDS: 'FondsDO' },
    durableObjectsPersist: mkdtempSync(join(tmpdir(), 'fonds-cle-')),
    bindings,
    ...(cap !== undefined ? { handleRuntimeStdio: cap.attach } : {}),
  });
  started.push(mf);
  return mf;
}

const bearer = (key: string): Record<string, string> => ({ Authorization: `Bearer ${key}` });

async function read(mf: Miniflare, path: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const res = await mf.dispatchFetch(`${BASE}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

async function openClaim(mf: Miniflare, key: string, orderId: string): Promise<number> {
  const res = await mf.dispatchFetch(`${BASE}/claims`, {
    method: 'POST',
    headers: { ...bearer(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      reason: 'test-raison',
      faultClass: 'seller',
      amountFcfa: 1_000,
      evidenceBundleId: `test-preuve-${orderId}`,
    }),
  });
  await res.arrayBuffer();
  return res.status;
}

/** What a missing key gets: the reference every refusal must equal. */
async function missingKeyAnswer(mf: Miniflare): Promise<{ status: number; body: unknown }> {
  return read(mf, '/claims', {});
}

describe('while PROTECTION_OPS_SECRET_NEXT is set, its key opens the same door as the current key', () => {
  it(
    'the current key and the next key each open a write and the reads, into the same book, with the same answers',
    async () => {
      const mf = worker({ current: CURRENT, next: NEXT });
      expect(await openClaim(mf, CURRENT, 'test-commande-actuelle'), 'a write with the current key').toBe(201);
      expect(await openClaim(mf, NEXT, 'test-commande-suivante'), 'a write with the next key').toBe(201);

      for (const path of ['/claims', '/fund', '/journal']) {
        const withCurrent = await read(mf, path, bearer(CURRENT));
        const withNext = await read(mf, path, bearer(NEXT));
        expect(withCurrent.status, `GET ${path} with the current key`).toBe(200);
        expect(withNext.status, `GET ${path} with the next key`).toBe(200);
        expect(withNext.body, `GET ${path}: the next key reads exactly what the current key reads`).toStrictEqual(withCurrent.body);
      }
      const claims = (await read(mf, '/claims', bearer(NEXT))).body as { items?: Array<{ orderId: string }> };
      const orders = JSON.stringify(claims);
      expect(orders, 'the next key wrote into the one book').toContain('test-commande-suivante');
      expect(orders, 'the current key wrote into the one book').toContain('test-commande-actuelle');
    },
    LIMIT,
  );

  it(
    'with only the next key set, the next key opens and nothing else does',
    async () => {
      const mf = worker({ next: NEXT });
      expect((await read(mf, '/claims', bearer(NEXT))).status).toBe(200);
      const reference = await missingKeyAnswer(mf);
      expect(reference).toStrictEqual({ status: 401, body: { error: 'unauthorized' } });
      for (const headers of [bearer(CURRENT), bearer(OTHER), { Authorization: 'Bearer ' }, { Authorization: 'Bearer' }, {}]) {
        expect(await read(mf, '/claims', headers), `refused: ${JSON.stringify(headers)}`).toStrictEqual(reference);
      }
    },
    LIMIT,
  );

  it(
    'a key that is neither, an empty key, or no key gets the one identical 401 — and an empty next key opens nothing',
    async () => {
      for (const keys of [
        { current: CURRENT, next: NEXT },
        { current: CURRENT, next: '' },
        { current: '', next: '' },
        {},
      ]) {
        const mf = worker(keys);
        const reference = await missingKeyAnswer(mf);
        expect(reference, `${JSON.stringify(keys)}: a missing key`).toStrictEqual({ status: 401, body: { error: 'unauthorized' } });
        for (const headers of [bearer(OTHER), { Authorization: 'Bearer ' }, { Authorization: 'Bearer' }, { Authorization: '' }]) {
          expect(await read(mf, '/claims', headers), `${JSON.stringify(keys)} ${JSON.stringify(headers)}`).toStrictEqual(reference);
          const write = await mf.dispatchFetch(`${BASE}/claims`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: '{}',
          });
          expect({ status: write.status, body: await write.json() }, `${JSON.stringify(keys)} POST ${JSON.stringify(headers)}`).toStrictEqual(reference);
        }
      }
    },
    LIMIT,
  );

  it(
    'the change, step by step: the new key is added, then made the only key, then the next change begins',
    async () => {
      const reference = { status: 401, body: { error: 'unauthorized' } };

      const overlap = worker({ current: CURRENT, next: NEXT });
      expect((await read(overlap, '/claims', bearer(CURRENT))).status, 'step 1: the old key still opens').toBe(200);
      expect((await read(overlap, '/claims', bearer(NEXT))).status, 'step 1: the new key already opens').toBe(200);

      const promoted = worker({ current: NEXT });
      expect((await read(promoted, '/claims', bearer(NEXT))).status, 'step 2: the new key is the key').toBe(200);
      expect(await read(promoted, '/claims', bearer(CURRENT)), 'step 2: the old key is refused').toStrictEqual(reference);

      const following = worker({ current: NEXT, next: THIRD });
      expect((await read(following, '/claims', bearer(NEXT))).status, 'step 3: the key still opens').toBe(200);
      expect((await read(following, '/claims', bearer(THIRD))).status, 'step 3: the next one opens too').toBe(200);
      expect(await read(following, '/claims', bearer(CURRENT)), 'step 3: the retired key stays refused').toStrictEqual(reference);
    },
    LIMIT,
  );

  it(
    '/health still answers without any key',
    async () => {
      const mf = worker({ current: CURRENT, next: NEXT });
      const res = await mf.dispatchFetch(`${BASE}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toStrictEqual({ ok: true, service: 'protection-service', release: 'dev', canon: 'dev' });
    },
    LIMIT,
  );
});

describe('the request line never says which key was presented', () => {
  it(
    'a request with the current key and one with the next key write lines of the same shape, and neither key is in the output',
    async () => {
      const cap = new Capture();
      const mf = worker({ current: CURRENT, next: NEXT }, cap);
      for (const [key, cid] of [
        [CURRENT, 'test-cid-actuelle'],
        [NEXT, 'test-cid-suivante'],
      ] as const) {
        const res = await mf.dispatchFetch(`${BASE}/claims`, { headers: { ...bearer(key), 'x-correlation-id': cid } });
        expect(res.status, cid).toBe(200);
        await res.arrayBuffer();
      }
      const withCurrent = await onlyLineFor(cap, 'test-cid-actuelle');
      const withNext = await onlyLineFor(cap, 'test-cid-suivante');
      expect(Object.keys(withNext).sort()).toStrictEqual(Object.keys(withCurrent).sort());
      const { ts: _a, durationMs: _b, correlation_id: _c, ...restCurrent } = withCurrent;
      const { ts: _d, durationMs: _e, correlation_id: _f, ...restNext } = withNext;
      expect(restNext).toStrictEqual(restCurrent);
      expect(restCurrent).toStrictEqual({ level: 'info', service: 'protection-service', msg: 'request', route: '/claims', method: 'GET', status: 200 });
      expect([CURRENT, NEXT].filter((k) => cap.text.includes(k))).toEqual([]);
    },
    LIMIT,
  );
});
