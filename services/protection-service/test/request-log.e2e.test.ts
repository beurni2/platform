import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The request log — one structured line per request (Execution Contract §6,
 * « Standards: structured logs »), read off the REAL bundle on workerd with
 * the runtime's own stdout and stderr captured.
 *
 * What a line may carry, and nothing else: service · route TEMPLATE · method
 * (a closed set, else OTHER) · status · durationMs · correlation_id (the
 * inbound x-correlation-id cut to 64 characters, else a minted one) · level ·
 * ts · msg 'request' · orderId on /claims/:orderId/advance only, and only in
 * the minted shape · on a throw, the error's CLASS name.
 *
 * What a line may never carry: an amount, a reason, a reference, a key, the
 * raw path, the query string, or anything about a person. This book records
 * money decisions the founder made outside; a log line that echoed them would
 * be a second, unguarded copy of that book (Laws 2 and 4).
 *
 * Levels: error for 5xx · warn for 401, 403, 413 and 429 · info otherwise.
 * Only 401 and the 5xx can be raised on the real Worker — nothing here answers
 * 403, 413 or 429 — so this file proves those two and claims nothing about the
 * other three.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = 'dist/worker/worker.mjs';
const WRANGLER_TOML = join(HERE, '..', 'wrangler.toml');
// The deployed date, read from the deploy's own file: how workerd parses a
// path depends on it (an older date decodes `%61` to `a`; this one keeps the
// raw segment the line tests).
const COMPATIBILITY_DATE = /^compatibility_date = "([^"]+)"$/m.exec(readFileSync(WRANGLER_TOML, 'utf8'))?.[1];
if (COMPATIBILITY_DATE === undefined) throw new Error('wrangler.toml names no compatibility_date');
const BASE = 'http://fonds.local';
const OPS_KEY = 'cle-ops-ZQX-PORTE-0001';
const LIMIT = 60_000;
const WAIT_MS = 3_000;

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
  lines(): Line[] {
    const out: Line[] = [];
    for (const raw of this.text.split('\n')) {
      const s = raw.trim();
      if (!s.startsWith('{')) continue;
      try {
        const v: unknown = JSON.parse(s);
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) out.push(v as Line);
      } catch {
        // workerd's own text is not ours to parse
      }
    }
    return out;
  }
  requestLines(): Line[] {
    return this.lines().filter((l) => l.msg === 'request');
  }
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Waits for the lines `pick` selects, then a short settle so a second line for
 * the same request would be seen too. The pipe lags the answer by a few ms.
 */
async function linesWhere(cap: Capture, pick: (l: Line) => boolean): Promise<Line[]> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (cap.requestLines().some(pick)) break;
    await pause(25);
  }
  await pause(150);
  return cap.requestLines().filter(pick);
}

const byCid = (cid: string) => (l: Line) => l.correlation_id === cid;

async function onlyLineFor(cap: Capture, cid: string): Promise<Line> {
  const found = await linesWhere(cap, byCid(cid));
  expect(found, `exactly one request line for ${cid}`).toHaveLength(1);
  return found[0] as Line;
}

function expectedLine(fields: {
  cid: string;
  level: 'info' | 'warn' | 'error';
  route: string;
  method: string;
  status: number;
  orderId?: string;
  error?: string;
}): Line {
  return {
    ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    level: fields.level,
    correlation_id: fields.cid,
    service: 'protection-service',
    msg: 'request',
    route: fields.route,
    method: fields.method,
    status: fields.status,
    durationMs: expect.any(Number),
    ...(fields.orderId !== undefined ? { orderId: fields.orderId } : {}),
    ...(fields.error !== undefined ? { error: fields.error } : {}),
  };
}

function ops(cid: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${OPS_KEY}`,
    'Content-Type': 'application/json',
    'x-correlation-id': cid,
    ...extra,
  };
}

/** Shop+ mints order ids as `ord-` + the quote id: `ord-quote-<lowercase uuid>`. */
const minted = (): string => `ord-quote-${crypto.randomUUID()}`;

function healthyWorker(cap: Capture): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    compatibilityDate: COMPATIBILITY_DATE,
    durableObjects: { FONDS: 'FondsDO' },
    durableObjectsPersist: mkdtempSync(join(tmpdir(), 'fonds-log-')),
    bindings: { PROTECTION_OPS_SECRET: OPS_KEY },
    handleRuntimeStdio: cap.attach,
  });
}

describe('the capture itself sees a Worker’s console.log', () => {
  it(
    'a probe Worker’s line arrives whole through the same capture',
    async () => {
      const cap = new Capture();
      const probe = new Miniflare({
        modules: true,
        script:
          "export default { async fetch() { console.log(JSON.stringify({ msg: 'request', correlation_id: 'probe-1' })); return new Response('ok'); } };",
        handleRuntimeStdio: cap.attach,
      });
      try {
        const res = await probe.dispatchFetch('http://probe.local/');
        expect(await res.text()).toBe('ok');
        expect(await linesWhere(cap, byCid('probe-1'))).toEqual([
          { msg: 'request', correlation_id: 'probe-1' },
        ]);
      } finally {
        await probe.dispose();
      }
    },
    LIMIT,
  );
});

describe('the real Worker writes one line per request', () => {
  const cap = new Capture();
  let mf: Miniflare;
  beforeAll(() => {
    mf = healthyWorker(cap);
  }, LIMIT);
  afterAll(async () => {
    await mf.dispose();
  }, LIMIT);

  const ORDER = minted();
  const UNKNOWN_MINTED = minted();

  describe('(i) the fields, route by route', () => {
    it(
      'GET /health → info 200',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/health`, { headers: { 'x-correlation-id': 'cid-health' } });
        expect(res.status).toBe(200);
        expect(await onlyLineFor(cap, 'cid-health')).toStrictEqual(
          expectedLine({ cid: 'cid-health', level: 'info', route: '/health', method: 'GET', status: 200 }),
        );
      },
      LIMIT,
    );

    it(
      'HEAD /health without a key → warn 401',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/health`, {
          method: 'HEAD',
          headers: { 'x-correlation-id': 'cid-head' },
        });
        expect(res.status).toBe(401);
        expect(await onlyLineFor(cap, 'cid-head')).toStrictEqual(
          expectedLine({ cid: 'cid-head', level: 'warn', route: '/health', method: 'HEAD', status: 401 }),
        );
      },
      LIMIT,
    );

    it(
      'OPTIONS /claims → info 204',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims`, {
          method: 'OPTIONS',
          headers: { 'x-correlation-id': 'cid-options' },
        });
        expect(res.status).toBe(204);
        expect(await onlyLineFor(cap, 'cid-options')).toStrictEqual(
          expectedLine({ cid: 'cid-options', level: 'info', route: '/claims', method: 'OPTIONS', status: 204 }),
        );
      },
      LIMIT,
    );

    it(
      'GET /claims without a key → warn 401',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims`, { headers: { 'x-correlation-id': 'cid-nokey' } });
        expect(res.status).toBe(401);
        expect(await onlyLineFor(cap, 'cid-nokey')).toStrictEqual(
          expectedLine({ cid: 'cid-nokey', level: 'warn', route: '/claims', method: 'GET', status: 401 }),
        );
      },
      LIMIT,
    );

    it(
      'POST /claims → info 201, and no orderId on the claims route',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims`, {
          method: 'POST',
          headers: ops('cid-open'),
          body: JSON.stringify({
            orderId: ORDER,
            reason: 'colis abime a la remise',
            faultClass: 'seller',
            amountFcfa: 12_500,
            evidenceBundleId: 'evb-log-001',
          }),
        });
        expect(res.status).toBe(201);
        expect(await onlyLineFor(cap, 'cid-open')).toStrictEqual(
          expectedLine({ cid: 'cid-open', level: 'info', route: '/claims', method: 'POST', status: 201 }),
        );
      },
      LIMIT,
    );

    it(
      'a Séra-fault claim refused 422 → info (only the named four warn)',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims`, {
          method: 'POST',
          headers: ops('cid-422'),
          body: JSON.stringify({
            orderId: minted(),
            reason: 'colis perdu en route',
            faultClass: 'sera',
            amountFcfa: 5_000,
            evidenceBundleId: 'evb-log-002',
          }),
        });
        expect(res.status).toBe(422);
        expect(await onlyLineFor(cap, 'cid-422')).toStrictEqual(
          expectedLine({ cid: 'cid-422', level: 'info', route: '/claims', method: 'POST', status: 422 }),
        );
      },
      LIMIT,
    );

    it(
      'GET /claims → info 200',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims`, { headers: ops('cid-list') });
        expect(res.status).toBe(200);
        expect(await onlyLineFor(cap, 'cid-list')).toStrictEqual(
          expectedLine({ cid: 'cid-list', level: 'info', route: '/claims', method: 'GET', status: 200 }),
        );
      },
      LIMIT,
    );

    it(
      'POST /claims/<minted>/advance → info 200 with the orderId',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims/${ORDER}/advance`, {
          method: 'POST',
          headers: ops('cid-advance'),
          body: JSON.stringify({ to: 'under_review' }),
        });
        expect(res.status).toBe(200);
        expect(await onlyLineFor(cap, 'cid-advance')).toStrictEqual(
          expectedLine({
            cid: 'cid-advance',
            level: 'info',
            route: '/claims/:orderId/advance',
            method: 'POST',
            status: 200,
            orderId: ORDER,
          }),
        );
      },
      LIMIT,
    );

    it(
      'the same advance again → info 409, the orderId on every status',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims/${ORDER}/advance`, {
          method: 'POST',
          headers: ops('cid-advance-409'),
          body: JSON.stringify({ to: 'under_review' }),
        });
        expect(res.status).toBe(409);
        expect(await onlyLineFor(cap, 'cid-advance-409')).toStrictEqual(
          expectedLine({
            cid: 'cid-advance-409',
            level: 'info',
            route: '/claims/:orderId/advance',
            method: 'POST',
            status: 409,
            orderId: ORDER,
          }),
        );
      },
      LIMIT,
    );

    it(
      'an unknown minted order → info 404, still with its orderId',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims/${UNKNOWN_MINTED}/advance`, {
          method: 'POST',
          headers: ops('cid-advance-404'),
          body: JSON.stringify({ to: 'under_review' }),
        });
        expect(res.status).toBe(404);
        expect(await onlyLineFor(cap, 'cid-advance-404')).toStrictEqual(
          expectedLine({
            cid: 'cid-advance-404',
            level: 'info',
            route: '/claims/:orderId/advance',
            method: 'POST',
            status: 404,
            orderId: UNKNOWN_MINTED,
          }),
        );
      },
      LIMIT,
    );

    // Segments that are NOT the minted shape: a free id, an uppercase uuid, a
    // minted id with one letter percent-encoded (the shape is tested on the
    // raw segment, never on a decoded one), and a minted id with something
    // after it or before it (the shape is the whole segment, not a part).
    const notMinted: Array<[string, string]> = [
      ['a free order id', 'order-x'],
      ['an uppercase uuid', `ord-quote-${crypto.randomUUID().toUpperCase()}`],
      ['a percent-encoded letter', `ord-quote-${crypto.randomUUID().replace(/[a-f]/, (c) => `%${c.charCodeAt(0).toString(16)}`)}`],
      ['a minted id with a tail', `${minted()}-ZQX-QUEUE-91`],
      ['a minted id behind a prefix', `ZQX-TETE-92-${minted()}`],
    ];
    for (const [label, segment] of notMinted) {
      it(
        `advance on ${label} → the route, but no orderId`,
        async () => {
          const cid = `cid-notminted-${label.replace(/\W+/g, '-')}`;
          const res = await mf.dispatchFetch(`${BASE}/claims/${segment}/advance`, {
            method: 'POST',
            headers: ops(cid),
            body: JSON.stringify({ to: 'under_review' }),
          });
          expect(res.status).toBe(404);
          expect(await onlyLineFor(cap, cid)).toStrictEqual(
            expectedLine({ cid, level: 'info', route: '/claims/:orderId/advance', method: 'POST', status: 404 }),
          );
        },
        LIMIT,
      );
    }

    it(
      'PUT /fund (a new declaration) → info 201',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/fund`, {
          method: 'PUT',
          headers: ops('cid-declare'),
          body: JSON.stringify({ commandId: 'cmd-log-001', balanceFcfa: 400_000 }),
        });
        expect(res.status).toBe(201);
        expect(await onlyLineFor(cap, 'cid-declare')).toStrictEqual(
          expectedLine({ cid: 'cid-declare', level: 'info', route: '/fund', method: 'PUT', status: 201 }),
        );
      },
      LIMIT,
    );

    it(
      'GET /fund → info 200',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/fund`, { headers: ops('cid-fund') });
        expect(res.status).toBe(200);
        expect(await onlyLineFor(cap, 'cid-fund')).toStrictEqual(
          expectedLine({ cid: 'cid-fund', level: 'info', route: '/fund', method: 'GET', status: 200 }),
        );
      },
      LIMIT,
    );

    it(
      'GET /journal → info 200',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/journal`, { headers: ops('cid-journal') });
        expect(res.status).toBe(200);
        expect(await onlyLineFor(cap, 'cid-journal')).toStrictEqual(
          expectedLine({ cid: 'cid-journal', level: 'info', route: '/journal', method: 'GET', status: 200 }),
        );
      },
      LIMIT,
    );

    it(
      'a path the book does not serve → route unmatched, info 404',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/ailleurs`, { headers: ops('cid-unmatched') });
        expect(res.status).toBe(404);
        expect(await onlyLineFor(cap, 'cid-unmatched')).toStrictEqual(
          expectedLine({ cid: 'cid-unmatched', level: 'info', route: 'unmatched', method: 'GET', status: 404 }),
        );
      },
      LIMIT,
    );

    for (const method of ['PATCH', 'DELETE'] as const) {
      it(
        `${method} is named as itself`,
        async () => {
          const cid = `cid-${method.toLowerCase()}`;
          const res = await mf.dispatchFetch(`${BASE}/fund`, { method, headers: ops(cid) });
          expect(res.status).toBe(404);
          expect(await onlyLineFor(cap, cid)).toStrictEqual(
            expectedLine({ cid, level: 'info', route: '/fund', method, status: 404 }),
          );
        },
        LIMIT,
      );
    }

    it(
      'a method outside the closed set → OTHER',
      async () => {
        const res = await mf.dispatchFetch(`${BASE}/claims`, { method: 'PROPFIND', headers: ops('cid-other') });
        expect(res.status).toBe(404);
        expect(await onlyLineFor(cap, 'cid-other')).toStrictEqual(
          expectedLine({ cid: 'cid-other', level: 'info', route: '/claims', method: 'OTHER', status: 404 }),
        );
      },
      LIMIT,
    );

    it(
      'an 80-character correlation id is cut to its first 64',
      async () => {
        const long = `cid-long-${'0123456789'.repeat(8)}`.slice(0, 80);
        const res = await mf.dispatchFetch(`${BASE}/health`, { headers: { 'x-correlation-id': long } });
        expect(res.status).toBe(200);
        const cut = long.slice(0, 64);
        expect(await onlyLineFor(cap, cut)).toStrictEqual(
          expectedLine({ cid: cut, level: 'info', route: '/health', method: 'GET', status: 200 }),
        );
      },
      LIMIT,
    );

    it(
      'no correlation id → a minted one, different per request',
      async () => {
        const mark = cap.requestLines().length;
        for (let i = 0; i < 2; i += 1) {
          const res = await mf.dispatchFetch(`${BASE}/journal`, { headers: { Authorization: `Bearer ${OPS_KEY}` } });
          expect(res.status).toBe(200);
        }
        const deadline = Date.now() + WAIT_MS;
        while (Date.now() < deadline && cap.requestLines().length < mark + 2) await pause(25);
        await pause(150);
        const fresh = cap.requestLines().slice(mark);
        expect(fresh).toHaveLength(2);
        const ids = fresh.map((l) => l.correlation_id);
        for (const id of ids) {
          expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        }
        expect(ids[0]).not.toBe(ids[1]);
        for (const l of fresh) {
          expect(l).toStrictEqual(
            expectedLine({ cid: l.correlation_id as string, level: 'info', route: '/journal', method: 'GET', status: 200 }),
          );
        }
      },
      LIMIT,
    );

    it(
      'an empty correlation id → a minted one, never an empty one',
      async () => {
        const mark = cap.requestLines().length;
        // `dispatchFetch` drops a header with an empty value before the Worker
        // sees it; a plain request to the runtime's own local socket keeps it.
        const res = await fetch(new URL('/journal', await mf.ready), {
          headers: { Authorization: `Bearer ${OPS_KEY}`, 'x-correlation-id': '' },
        });
        expect(res.status).toBe(200);
        const deadline = Date.now() + WAIT_MS;
        while (Date.now() < deadline && cap.requestLines().length < mark + 1) await pause(25);
        await pause(150);
        const fresh = cap.requestLines().slice(mark);
        expect(fresh).toHaveLength(1);
        const line = fresh[0] as Line;
        expect(line.correlation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(line).toStrictEqual(
          expectedLine({ cid: line.correlation_id as string, level: 'info', route: '/journal', method: 'GET', status: 200 }),
        );
      },
      LIMIT,
    );
  });

  describe('(ii) nothing a request carries leaks into the output', () => {
    // Each sentinel sits in one place a careless line could copy from: a body
    // field, the answer, a key, a header, the query, the raw path, or the part
    // of a correlation id past its 64th character.
    const AMOUNT = 7_654_321;
    const DECLARED = 8_765_432;
    const CAPITAL = 9_876_543;
    const S = {
      reason: 'ZQX-RAISON-71',
      evidence: 'ZQX-PREUVE-72',
      openedOrder: 'commande-ZQX-ORDRE-55',
      settlementRef: 'ZQX-REGLEMENT-73',
      closedReason: 'ZQX-FERMETURE-74',
      commandId: 'cmd-ZQX-COMMANDE-31',
      note: 'ZQX-NOTE-75',
      wrongKey: 'ZQX-MAUVAISE-CLE-44',
      query: 'ZQX-REQUETE-88',
      userAgent: 'ZQX-NAVIGATEUR-12',
      cookie: 'ZQX-BISCUIT-90',
      ip: '198.51.100.123',
      forwarded: '192.0.2.201',
      path: 'ZQX-CHEMIN-66',
      pastCut: 'ZQX-AU-DELA-64',
    } as const;
    const LONG_CID = `cid-sweep-long-${'x'.repeat(49)}`;
    const SENTINELS: string[] = [
      ...Object.values(S),
      String(AMOUNT),
      String(DECLARED),
      String(CAPITAL),
      OPS_KEY,
    ];

    it(
      'every sweep request writes its one line, and no sentinel appears anywhere',
      async () => {
        expect(LONG_CID).toHaveLength(64);
        const personal = {
          'User-Agent': S.userAgent,
          Cookie: `session=${S.cookie}`,
          'CF-Connecting-IP': S.ip,
          'X-Forwarded-For': S.forwarded,
        };
        const resolvedOrder = minted();
        const closedOrder = minted();
        const sent: string[] = [];
        const send = async (cid: string, path: string, init: RequestInit, status: number): Promise<void> => {
          const res = await mf.dispatchFetch(`${BASE}${path}`, init);
          expect(res.status, `${init.method ?? 'GET'} ${path}`).toBe(status);
          // The id is for the log only: the answer never carries it back.
          expect(res.headers.has('x-correlation-id'), `${init.method ?? 'GET'} ${path}: no x-correlation-id on the answer`).toBe(false);
          sent.push(cid);
        };
        const claim = (orderId: string) =>
          JSON.stringify({
            orderId,
            reason: S.reason,
            faultClass: 'seller',
            amountFcfa: AMOUNT,
            evidenceBundleId: S.evidence,
          });

        await send('sw-open-1', '/claims', { method: 'POST', headers: ops('sw-open-1', personal), body: claim(resolvedOrder) }, 201);
        await send('sw-open-2', '/claims', { method: 'POST', headers: ops('sw-open-2', personal), body: claim(closedOrder) }, 201);
        await send('sw-open-3', '/claims', { method: 'POST', headers: ops('sw-open-3', personal), body: claim(S.openedOrder) }, 201);
        await send(
          'sw-review',
          `/claims/${resolvedOrder}/advance`,
          { method: 'POST', headers: ops('sw-review', personal), body: JSON.stringify({ to: 'under_review' }) },
          200,
        );
        await send(
          'sw-resolve',
          `/claims/${resolvedOrder}/advance`,
          {
            method: 'POST',
            headers: ops('sw-resolve', personal),
            body: JSON.stringify({ to: 'resolved', settlementRef: S.settlementRef }),
          },
          200,
        );
        await send(
          'sw-close',
          `/claims/${closedOrder}/advance`,
          {
            method: 'POST',
            headers: ops('sw-close', personal),
            body: JSON.stringify({ to: 'closed_no_payout', closedReason: S.closedReason }),
          },
          200,
        );
        await send(
          'sw-free-path',
          `/claims/${S.openedOrder}/advance`,
          { method: 'POST', headers: ops('sw-free-path', personal), body: JSON.stringify({ to: 'under_review' }) },
          200,
        );
        await send(
          'sw-declare',
          '/fund',
          {
            method: 'PUT',
            headers: ops('sw-declare', personal),
            body: JSON.stringify({
              commandId: S.commandId,
              balanceFcfa: DECLARED,
              openingFundCapitalFcfa: CAPITAL,
              note: S.note,
            }),
          },
          201,
        );
        await send('sw-fund', '/fund', { headers: ops('sw-fund', personal) }, 200);
        await send('sw-list', `/claims?limit=10&q=${S.query}`, { headers: ops('sw-list', personal) }, 200);
        await send('sw-journal', `/journal?limit=5&trace=${S.query}`, { headers: ops('sw-journal', personal) }, 200);
        await send(
          'sw-wrong-key',
          '/claims',
          { headers: { Authorization: `Bearer ${S.wrongKey}`, 'x-correlation-id': 'sw-wrong-key', ...personal } },
          401,
        );
        await send('sw-raw-path', `/${S.path}/secret`, { headers: ops('sw-raw-path', personal) }, 404);
        await send('sw-health', `/health?who=${S.query}`, { headers: { 'x-correlation-id': `${LONG_CID}${S.pastCut}`, ...personal } }, 200);

        // Not vacuous: each request above wrote exactly one line.
        for (const cid of sent) {
          const want = cid === 'sw-health' ? LONG_CID : cid;
          expect(await linesWhere(cap, byCid(want)), `one line for ${want}`).toHaveLength(1);
        }
        expect(SENTINELS.filter((s) => cap.text.includes(s))).toEqual([]);
      },
      LIMIT,
    );
  });
});

describe('(iii) the deploy turns the Workers log on, with the query string redacted', () => {
  it(
    'wrangler reads the observability block as written',
    async () => {
      const { unstable_readConfig } = await import('wrangler');
      const config = unstable_readConfig({ config: WRANGLER_TOML });
      expect(config.observability).toStrictEqual({
        enabled: true,
        head_sampling_rate: 1,
        redact_query_string: true,
        logs: { invocation_logs: false },
      });
    },
    LIMIT,
  );
});

describe('(iv) a throw writes an error line with the class name only, and is re-thrown', () => {
  // The Worker is started WITHOUT its book binding, so the Worker's own call
  // into it throws — a real throw in the real code, past the key check.
  const cap = new Capture();
  let bare: Miniflare;
  beforeAll(() => {
    bare = new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      compatibilityDate: COMPATIBILITY_DATE,
      bindings: { PROTECTION_OPS_SECRET: OPS_KEY },
      handleRuntimeStdio: cap.attach,
    });
  }, LIMIT);
  afterAll(async () => {
    await bare.dispose();
  }, LIMIT);

  it(
    'an authorized GET /claims → the runtime’s own 500, and the line says error, 500, TypeError',
    async () => {
      const res = await bare.dispatchFetch(`${BASE}/claims`, { headers: ops('cid-throw') });
      expect(res.status).toBe(500);
      // The runtime's own answer to an uncaught throw: proof it was re-thrown,
      // not answered by hand.
      expect(await res.text()).toMatch(/^TypeError: /);
      const line = await onlyLineFor(cap, 'cid-throw');
      expect(line).toStrictEqual(
        expectedLine({ cid: 'cid-throw', level: 'error', route: '/claims', method: 'GET', status: 500, error: 'TypeError' }),
      );
      expect(JSON.stringify(line)).not.toMatch(/undefined|reading|properties/i);
    },
    LIMIT,
  );
});
