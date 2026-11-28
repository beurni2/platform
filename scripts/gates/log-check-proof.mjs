#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * PROOF of scripts/log-check.mjs — the read-only check of the live services'
 * logs that the founder starts by hand on GitHub.
 *
 * Two halves:
 *   · the scanner, imported and fed trees: a clean line in each service's REAL
 *     field shape (read off each repository's log writer) finds nothing; every
 *     planted kind is counted under the right key path, however deep, inside
 *     arrays and inside a line kept as text; ids, timestamps and technical key
 *     names are not hits; a key that is not safe to print is never printed;
 *   · the real script, run as a child process with `fetch` stood in. Its whole
 *     stdout and stderr are kept: the verdicts and the exit code are checked,
 *     and no planted value, id, key or answer body may appear in either.
 *
 * Bounds of the stand-in (it is written into a temporary folder and loaded
 * with `node --import` into the child only): it answers with Cloudflare's
 * documented envelope `{success, errors, messages, result}` and nothing
 * richer. The events in `result` carry only the documented `$metadata` keys
 * (service, message, error) beside our own line; where Cloudflare really puts
 * our line is unknown, so the fixtures place it three ways (as text in
 * `$metadata.message`, as an object under a placeholder key `champs`, and
 * spread beside `$metadata`) and the scanner must hold in each. It does not
 * model paging, rate limits, Cloudflare's own event fields or ids, and it
 * proves nothing about the real response shape: the founder's first run does.
 * A timeout is the DOMException a real fetch throws when its
 * AbortSignal.timeout fires.
 *
 * Exit 0 when every case answers as it must, 1 otherwise.
 */
const ROOT = resolve('.');
const script = resolve('scripts/log-check.mjs');
if (!existsSync(script)) {
  console.error(`log-check-proof FAILED — ${script} does not exist: nothing reads the live services' logs`);
  process.exit(1);
}
const mod = await import(pathToFileURL(script).href);
if (typeof mod.scanne !== 'function') {
  console.error('log-check-proof FAILED — scripts/log-check.mjs exports no scanne(result, service)');
  process.exit(1);
}
const { scanne } = mod;

const failures = [];
const ok = (name) => console.log(`  ok — ${name}`);
const fail = (name, why) => failures.push(`${name}: ${why}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ─── Fixtures: the lines each live service really writes ──────────────────
// Field names and value shapes from each repository's log writer (frame:
// ts, level, correlation_id, service, msg). Every id is fake, and several
// hold 8-digit runs on purpose: an id must never read as a phone number.
const TS = '2026-11-28T06:12:33.123Z';
const UUID_DIGITS = '12345678-1234-4123-8123-123456789abc';
const UUID_ZERO = '00000000-0000-4000-8000-000000000000';
const ORDER = 'ord-quote-87654321-4321-4321-8321-cba987654321';
const QUOTE = `quote-${UUID_ZERO}`;
const GROUP = 'grp-7012345678901234567890123456789012345abc';
const frame = (service, level, cid, msg) => ({ ts: TS, level, correlation_id: cid, service, msg });

const REAL = {
  'custody-service': [
    { ...frame('custody-service', 'info', `corr-${ORDER}`, 'request'), route: '/rider/verification', method: 'POST', status: 200, durationMs: 41, orderId: ORDER },
    { ...frame('custody-service', 'warn', `corr-${ORDER}`, 'outbox_undelivered'), outbox: 'custody:transit-outbox:v1', stage: 'en_route', orderId: ORDER, attempts: 3, status: 503 },
    { ...frame('custody-service', 'error', UUID_ZERO, 'alarm_rearm_failed'), error: 'Error' },
  ],
  'logistics-service': [
    { ...frame('logistics-service', 'warn', `corr-${ORDER}`, 'outbox_undelivered'), outbox: 'snap:custody-outbox:v1', phase: 'arm', orderId: ORDER, attempts: 2, reason: 'no_supplier' },
    { ...frame('logistics-service', 'info', UUID_DIGITS, 'request'), route: '/rider/repere-audio', method: 'GET', status: 200, durationMs: 18 },
    { ...frame('logistics-service', 'warn', UUID_ZERO, 'request'), route: '/ops/rider-code/reveal', method: 'POST', status: 401, durationMs: 2 },
  ],
  'storefront-service': [
    { ...frame('storefront-service', 'info', `corr-${GROUP}`, 'request'), route: '/checkout/group/:groupId', method: 'GET', status: 200, durationMs: 8, groupId: GROUP },
    { ...frame('storefront-service', 'info', UUID_DIGITS, 'request'), route: '/checkout/quote/:quoteId/reserve', method: 'POST', status: 409, durationMs: 22, quoteId: QUOTE },
    { ...frame('storefront-service', 'warn', `corr-${ORDER}`, 'dlq_park_failed'), orderId: ORDER, reason: 'bad_order_id', error: 'TypeError' },
    { ...frame('storefront-service', 'warn', `corr-${ORDER}`, 'outbox_undelivered'), outbox: 'sera-funding-outbox', orderId: ORDER, attempts: 4, reason: 'timeout' },
  ],
  'offer-service': [
    { ...frame('offer-service', 'error', `corr-${ORDER}`, 'outbox_undelivered'), orderId: ORDER, outbox: 'storefront', attempts: 7, status: 422, parked: true },
    { ...frame('offer-service', 'info', UUID_DIGITS, 'request'), route: '/fulfillment/supplier-contact', method: 'GET', status: 200, durationMs: 30 },
    { ...frame('offer-service', 'warn', UUID_ZERO, 'projection_omitted'), error: 'ZodError' },
  ],
  'media-service': [
    { ...frame('media-service', 'warn', UUID_DIGITS, 'request'), route: '/media/:key', method: 'PUT', status: 413, durationMs: 5 },
  ],
  'protection-service': [
    { ...frame('protection-service', 'info', UUID_DIGITS, 'request'), route: '/claims/:orderId/advance', method: 'POST', status: 200, durationMs: 12, orderId: ORDER },
    { ...frame('protection-service', 'error', 'test-chaine-0001', 'request'), route: '/claims', method: 'GET', status: 500, durationMs: 3, error: 'TypeError' },
  ],
};
const SIX = Object.keys(REAL);

// The three places our line may sit in an event (see the bounds above).
const enTexte = (line) => ({ $metadata: { service: line.service, message: JSON.stringify(line) } });
const aCote = (line) => ({
  $metadata: { service: line.service, message: line.msg, ...(line.error !== undefined ? { error: line.error } : {}) },
  champs: line,
});
const aPlat = (line) => ({ $metadata: { service: line.service, message: line.msg }, ...line });
const PLACEMENTS = { 'as text in $metadata.message': enTexte, 'as an object beside $metadata': aCote, 'spread beside $metadata': aPlat };
const melange = (lines) => lines.map((l, i) => [enTexte, aCote, aPlat][i % 3](l));

// One of each kind, planted under a key path the case names.
const PLANTE = {
  x1: '70123456',
  x2: '70 12 34 56',
  x3: '+226 70 12 34 56',
  x4: '0022670123456',
  x5: '+22670123456',
  x6: 70123456,
  x7: 'appel au 76 54 32 10 demain',
  buyerPhone: 'test-ref-0001',
  telephone: 'test-ref-0002',
  x8: 'test.cliente@example.com',
  courriel: 'test-ref-0003',
  x9: '12.3714, -1.5197',
  x10: [-1.5197, 12.3714],
  latitude: 12.3714,
  pin: 'test-ref-0004',
  buyerDropCode: 'test-0000',
  presentedPickupCode: 'test-0001',
  password: 'test-mdp',
  landmark: 'test-repere',
  voiceNote: 'test-voix',
  buyerName: 'test-nom',
  adresse: 'test-adresse',
  ip: 'test-ip-1',
  clientIp: 'test-ip-2',
  ipAddress: 'test-ip-3',
  remoteAddr: 'test-ip-4',
  forwardedFor: 'test-ip-5',
  xForwardedFor: 'test-ip-6',
  cfConnectingIp: 'test-ip-7',
  amountFcfa: 11000,
  x11: '3 333 F',
  x12: '12 500 FCFA',
  x13: 'payé en XOF',
};
const under = (prefix, keys) => Object.fromEntries(keys.map((k) => [`${prefix}.${k}`, 1]));
const P = 'events[].champs';
const PLANTE_ATTENDU = {
  telephone: under(P, ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'buyerPhone', 'telephone']),
  email: under(P, ['x8', 'courriel']),
  carte: under(P, ['x9', 'x10', 'latitude', 'pin']),
  cle: under(P, [
    'buyerDropCode', 'presentedPickupCode', 'password', 'landmark', 'voiceNote', 'buyerName', 'adresse',
    'ip', 'clientIp', 'ipAddress', 'remoteAddr', 'forwardedFor', 'xForwardedFor', 'cfConnectingIp',
  ]),
  montant: under(P, ['amountFcfa', 'x11', 'x12', 'x13']),
};
const KINDS = ['telephone', 'email', 'carte', 'cle', 'montant'];
const RIEN = Object.fromEntries(KINDS.map((k) => [k, {}]));

/** A scan as plain data, each kind's paths sorted, so two scans compare as text. */
function vue(scan) {
  const out = { lignes: scan.lignes, autres: scan.autres };
  for (const k of KINDS) {
    const m = scan.trouvailles?.[k];
    out[k] = m instanceof Map ? Object.fromEntries([...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : m;
  }
  return out;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
function expectScan(name, result, service, want) {
  let got;
  try {
    got = vue(scanne(result, service));
  } catch (e) {
    fail(name, `scanne threw ${e instanceof Error ? e.name : 'a non-error'}`);
    return;
  }
  const expected = { lignes: want.lignes, autres: want.autres ?? 0 };
  for (const k of KINDS) expected[k] = sorted(want[k] ?? {});
  if (same(got, expected)) ok(name);
  else fail(name, `wanted ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
}

// ─── The scanner ──────────────────────────────────────────────────────────
console.log('the scanner:');
for (const service of SIX) {
  for (const [where, place] of Object.entries(PLACEMENTS)) {
    expectScan(`${service}: its real lines, ${where}, find nothing`, { events: REAL[service].map(place) }, service, {
      lignes: REAL[service].length,
      ...RIEN,
    });
  }
}
expectScan('the result as a bare list, and nested deep in objects, still counts its lines', [
  ...REAL['media-service'].map(aCote),
  { a: { b: { events: REAL['media-service'].map(enTexte) } } },
], 'media-service', { lignes: 2, ...RIEN });

const tous = SIX.flatMap((s) => melange(REAL[s]));
expectScan('lines of other services are scanned but not counted as this service’s lines', { events: tous }, 'custody-service', {
  lignes: REAL['custody-service'].length,
  autres: tous.length - REAL['custody-service'].length,
  ...RIEN,
});
expectScan('an event whose $metadata names no service is not one of this service’s lines', {
  events: [{ $metadata: { message: 'request' }, champs: REAL['custody-service'][0] }],
}, 'custody-service', { lignes: 0, autres: 1, ...RIEN });
expectScan('our lines with no $metadata object around them are no lines at all', {
  events: [...REAL['protection-service'], { $metadata: 'request', ...REAL['protection-service'][0] }, { $metadata: [REAL['protection-service'][0]] }],
}, 'protection-service', { lignes: 0, ...RIEN });

expectScan('every planted kind is counted under its key path', {
  events: [...REAL['protection-service'].map(enTexte), { $metadata: { service: 'protection-service', message: 'request' }, champs: PLANTE }],
}, 'protection-service', { lignes: 3, ...PLANTE_ATTENDU });

expectScan('a hit six levels down, in a list, inside a line kept as text, is counted', {
  events: [{ $metadata: { service: 'custody-service', message: JSON.stringify({ a: { b: [{ c: { d: { e: { f: '70 11 22 33' } } } }] } }) } }],
}, 'custody-service', { lignes: 1, telephone: { 'events[].$metadata.message.a.b[].c.d.e.f': 1 } });
expectScan('a hit six levels down in plain objects is counted', {
  events: [{ $metadata: { service: 'custody-service' }, champs: { n1: { n2: { n3: { n4: { n5: { n6: 'test.livreur@example.com' } } } } } } }],
}, 'custody-service', { lignes: 1, email: { 'events[].champs.n1.n2.n3.n4.n5.n6': 1 } });
expectScan('a hit inside a list of lists is counted under the list’s path', {
  events: [{ $metadata: { service: 'custody-service' }, champs: { lots: [['test-a', ['+226 70 12 34 56']]] } }],
}, 'custody-service', { lignes: 1, telephone: { 'events[].champs.lots[][][]': 1 } });

expectScan('a key that is itself a phone number is counted, and never printed', {
  events: [{ $metadata: { service: 'offer-service' }, champs: { 70123456: 'test-x' } }],
}, 'offer-service', { lignes: 1, telephone: { 'events[].champs.[clé non affichée]': 1 } });
expectScan('a key shaped like an id, too long, or not a plain name is never printed; a plain name is', {
  events: [{
    $metadata: { service: 'offer-service' },
    champs: {
      af1a2b3c4d5e6f70: { buyerName: 'test-x' },
      deadbeefcafe: { buyerName: 'test-x' },
      [`k${'e'.repeat(41)}`]: { buyerName: 'test-x' },
      'clé-avec-tiret': { buyerName: 'test-x' },
      sha256: { buyerName: 'test-x' },
    },
  }],
}, 'offer-service', {
  lignes: 1,
  cle: { 'events[].champs.[clé non affichée].buyerName': 4, 'events[].champs.sha256.buyerName': 1 },
});

expectScan('timestamps, ids, versions and technical key names are not hits', {
  events: [{
    $metadata: { service: 'protection-service', message: 'request', error: 'TypeError' },
    champs: {
      ts: TS,
      startTime: 1764310353123,
      now: 1764310353,
      at: '1764310353123',
      cpuTimeMs: 3,
      statusCode: 200,
      errorCode: 'test-e1',
      reasonCode: 'test-motif',
      scriptName: 'protection-service',
      serviceName: 'protection-service',
      eventName: 'request',
      version: '3.28.0',
      release: '04e7768',
      orderId: ORDER,
      quoteId: QUOTE,
      groupId: GROUP,
      correlation_id: `corr-${GROUP}`,
      traceId: '12345678abcdef0012345678abcdef00',
      spanId: '70123456af1a2b3c',
      routes: ['/rider/repere-audio', '/ops/rider-code/reveal', '/fulfillment/supplier-contact', '/checkout/webhook/payment'],
    },
  }],
}, 'protection-service', { lignes: 1, ...RIEN });

// ─── The script, run whole, with fetch stood in ───────────────────────────
const work = mkdtempSync(join(tmpdir(), 'log-check-'));
const STAND_IN = join(work, 'cloudflare-stand-in.mjs');
writeFileSync(
  STAND_IN,
  `import { appendFileSync, readFileSync } from 'node:fs';
const scenario = JSON.parse(readFileSync(process.env.LOG_CHECK_TEST_SCENARIO, 'utf8'));
const journal = process.env.LOG_CHECK_TEST_JOURNAL;
globalThis.fetch = async (url, init = {}) => {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const body = typeof init.body === 'string' ? init.body : null;
  appendFileSync(journal, JSON.stringify({ url: String(url), method: init.method ?? 'GET', headers, body, signal: init.signal instanceof AbortSignal }) + '\\n');
  let service = null;
  try { service = JSON.parse(body).parameters.filters[0].value; } catch {}
  const answer = scenario[service];
  if (answer === undefined) {
    return new Response(JSON.stringify({ success: false, errors: [{ code: 9999, message: 'test: no scenario' }], messages: [], result: null }), { status: 400 });
  }
  if (answer.panne === 'delai') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  if (answer.panne === 'reseau') throw new TypeError('fetch failed');
  return new Response(answer.texte ?? JSON.stringify(answer.corps), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } });
};
`,
);

const TOKEN = 'test-logs-token-0001';
const ACCOUNT = 'deadbeefdeadbeefdeadbeefdeadbeef';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/observability/telemetry/query`;
const lu = (result) => ({ corps: { success: true, errors: [], messages: [], result } });
const refus = (status, errors, messages = []) => ({ status, corps: { success: false, errors, messages, result: null } });
const propre = (service) => lu({ events: melange(REAL[service]) });

// Nothing a fixture carries may reach the output: every planted value, every
// id, the key, the account, and the bodies the stand-in answers with.
const NEVER = [
  TOKEN, ACCOUNT, TS, UUID_DIGITS, UUID_ZERO, ORDER, QUOTE, GROUP, 'test-chaine-0001',
  ...Object.values(PLANTE).flatMap((v) => (Array.isArray(v) ? v.map(String) : [String(v)])),
  '70 99 88 77', 'test-pas-du-json', 'test-marqueur-messages-77', 'test: fourth', 'test-deploy-token',
];

let runs = 0;
function run(name, { env = {}, scenario = {} } = {}) {
  runs += 1;
  const scenarioFile = join(work, `scenario-${runs}.json`);
  const journalFile = join(work, `journal-${runs}.jsonl`);
  writeFileSync(scenarioFile, JSON.stringify(scenario));
  writeFileSync(journalFile, '');
  const base = {
    PATH: process.env.PATH,
    HOME: process.env.HOME ?? work,
    CLOUDFLARE_LOGS_TOKEN: TOKEN,
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    LOG_CHECK_TEST_SCENARIO: scenarioFile,
    LOG_CHECK_TEST_JOURNAL: journalFile,
  };
  const childEnv = { ...base, ...env };
  for (const [k, v] of Object.entries(childEnv)) if (v === undefined) delete childEnv[k];
  return new Promise((done) => {
    const child = spawn(process.execPath, ['--import', pathToFileURL(STAND_IN).href, script], { cwd: ROOT, env: childEnv });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('close', (exit) => {
      clearTimeout(timer);
      const requests = readFileSync(journalFile, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
      const leaked = NEVER.filter((s) => stdout.includes(s) || stderr.includes(s));
      if (leaked.length > 0) fail(name, `the output carries what it must never print: ${JSON.stringify(leaked)}`);
      done({ exit, stdout, stderr, requests });
    });
  });
}

const HEAD = (n, h = 72) => `Vérification des journaux (lecture seule) — ${n} service${n > 1 ? 's' : ''}, fenêtre de ${h} h`;
const FIN = 'Cette vérification ne fait que lire : rien n\'a été changé sur aucun service.';
const bilan = (n, a, b, c) => `Bilan : ${n} service${n > 1 ? 's' : ''} — OK ${a} · À REGARDER ${b} · NON LU ${c}`;
const lignes = (n) => `${n} ${n > 1 ? 'lignes lues' : 'ligne lue'}`;
const blocPropre = (service, n, h = 72) => [
  `${service} — ${lignes(n)} (${h} h)`,
  '  téléphone : 0',
  '  e-mail : 0',
  '  point sur la carte : 0',
  '  code, secret, nom ou adresse : 0',
  '  montant : 0',
  '  → OK',
];
const AUCUNE = (h = 72) => `  → NON LU : aucune ligne lue (rien dans la fenêtre de ${h} h, ou la réponse n'a pas la forme attendue)`;

function expectRun(name, r, { exit, stdout, stdoutHas = [], stdoutLacks = [], stderrHas, requests }) {
  const why = [];
  if (r.exit !== exit) why.push(`exit ${r.exit}, wanted ${exit}`);
  if (stdout !== undefined && r.stdout !== stdout) why.push(`stdout was:\n${r.stdout}\nwanted:\n${stdout}`);
  for (const s of stdoutHas) if (!r.stdout.includes(s)) why.push(`stdout lacks « ${s} »:\n${r.stdout}`);
  for (const s of stdoutLacks) if (r.stdout.includes(s)) why.push(`stdout carries « ${s} »`);
  if (stderrHas === undefined && r.stderr !== '') why.push(`stderr was not empty: ${r.stderr}`);
  if (stderrHas !== undefined && !r.stderr.includes(stderrHas)) why.push(`stderr lacks « ${stderrHas} »: ${r.stderr}`);
  if (requests !== undefined && r.requests.length !== requests) why.push(`${r.requests.length} request(s) sent, wanted ${requests}`);
  if (why.length > 0) fail(name, why.join(' · '));
  else ok(name);
}

console.log('the script, run whole:');

const DEFAUT = ['custody-service', 'logistics-service', 'storefront-service', 'offer-service', 'media-service', 'protection-service'];
{
  const name = 'six clean services → six OK, exit 0, one well-shaped query each';
  const r = await run(name, { scenario: Object.fromEntries(DEFAUT.map((s) => [s, propre(s)])) });
  expectRun(name, r, {
    exit: 0,
    stdout: [HEAD(6), ...DEFAUT.flatMap((s) => blocPropre(s, REAL[s].length)), bilan(6, 6, 0, 0), FIN, ''].join('\n'),
    requests: 6,
  });
  const now = Date.now();
  // Checked on each of the six, so a run that sent none cannot pass here.
  const why = r.requests.length === DEFAUT.length ? [] : [`${r.requests.length} queries, wanted one per service`];
  r.requests.forEach((q, i) => {
    let body;
    try {
      body = JSON.parse(q.body);
    } catch {
      why.push(`request ${i}: the body is not JSON`);
      return;
    }
    if (q.method !== 'POST') why.push(`request ${i}: method ${q.method}`);
    if (q.url !== API) why.push(`request ${i}: url ${q.url}`);
    if (q.headers.authorization !== `Bearer ${TOKEN}`) why.push(`request ${i}: no Bearer with the logs key`);
    if (!String(q.headers['content-type']).startsWith('application/json')) why.push(`request ${i}: content-type ${q.headers['content-type']}`);
    if (!q.signal) why.push(`request ${i}: no time limit (AbortSignal)`);
    if (!same(Object.keys(body), ['view', 'timeframe', 'limit', 'parameters'])) why.push(`request ${i}: body keys ${Object.keys(body)}`);
    if (body.view !== 'events') why.push(`request ${i}: view ${body.view}`);
    if (body.limit !== 100) why.push(`request ${i}: limit ${body.limit}`);
    if (!same(Object.keys(body.parameters ?? {}), ['filters'])) why.push(`request ${i}: parameters keys`);
    if (!same(body.parameters?.filters, [{ key: '$metadata.service', operation: 'eq', type: 'string', value: DEFAUT[i] }])) {
      why.push(`request ${i}: filters ${JSON.stringify(body.parameters?.filters)}`);
    }
    const { from, to } = body.timeframe ?? {};
    if (!same(Object.keys(body.timeframe ?? {}), ['from', 'to'])) why.push(`request ${i}: timeframe keys`);
    if (!(Number.isInteger(from) && Number.isInteger(to) && to - from === 72 * 3_600_000)) why.push(`request ${i}: window ${from}..${to}`);
    if (!(Math.abs(to - now) < 120_000)) why.push(`request ${i}: « to » is not now`);
  });
  if (why.length > 0) fail('each query', why.join(' · '));
  else ok('each query: POST to the documented path, the logs key, a time limit, view events, limit 100, the service filter, the window in milliseconds');
}
{
  const name = 'two services named, 168 hours → two queries over 168 hours';
  const r = await run(name, {
    env: { LOG_CHECK_HOURS: '168', LOG_CHECK_SERVICES: 'media-service, protection-service' },
    scenario: { 'media-service': propre('media-service'), 'protection-service': propre('protection-service') },
  });
  expectRun(name, r, {
    exit: 0,
    stdout: [HEAD(2, 168), ...blocPropre('media-service', 1, 168), ...blocPropre('protection-service', 2, 168), bilan(2, 2, 0, 0), FIN, ''].join('\n'),
    requests: 2,
  });
  const windows = r.requests.map((q) => { const t = JSON.parse(q.body).timeframe; return t.to - t.from; });
  if (!same(windows, [168 * 3_600_000, 168 * 3_600_000])) fail(name, `windows ${windows}`);
}
{
  const name = 'empty hours and services read as the defaults';
  const r = await run(name, { env: { LOG_CHECK_HOURS: '', LOG_CHECK_SERVICES: '' }, scenario: Object.fromEntries(DEFAUT.map((s) => [s, propre(s)])) });
  expectRun(name, r, { exit: 0, stdoutHas: [HEAD(6), bilan(6, 6, 0, 0)], requests: 6 });
}
{
  const name = 'the key refused (403) → NON LU with Cloudflare’s code and a plain sentence, and nothing else';
  const r = await run(name, {
    env: { LOG_CHECK_SERVICES: 'protection-service' },
    scenario: { 'protection-service': refus(403, [{ code: 10000, message: 'Authentication error' }], [{ code: 10001, message: 'test-marqueur-messages-77' }]) },
  });
  expectRun(name, r, {
    exit: 1,
    stdout: [
      HEAD(1),
      'protection-service — NON LU : Cloudflare refuse la clé, ou elle n\'a pas le droit de lire les journaux. (HTTP 403 · code 10000 « Authentication error »)',
      bilan(1, 0, 0, 1),
      FIN,
      '',
    ].join('\n'),
    requests: 1,
  });
}
{
  const name = 'an answer whose result holds no $metadata object → NON LU « aucune ligne lue », never OK';
  const r = await run(name, {
    env: { LOG_CHECK_SERVICES: 'protection-service' },
    scenario: { 'protection-service': lu({ events: REAL['protection-service'] }) },
  });
  expectRun(name, r, {
    exit: 1,
    stdout: [
      HEAD(1),
      `protection-service — ${lignes(0)} (72 h)`,
      '  téléphone : 0',
      '  e-mail : 0',
      '  point sur la carte : 0',
      '  code, secret, nom ou adresse : 0',
      '  montant : 0',
      AUCUNE(),
      bilan(1, 0, 0, 1),
      FIN,
      '',
    ].join('\n'),
  });
}
{
  const name = 'only other services’ lines in the answer → NON LU, and their number said';
  const r = await run(name, {
    env: { LOG_CHECK_SERVICES: 'custody-service' },
    scenario: { 'custody-service': lu({ events: REAL['storefront-service'].slice(0, 2).map(aCote) }) },
  });
  expectRun(name, r, {
    exit: 1,
    stdoutHas: [`custody-service — ${lignes(0)} (72 h) · 2 lignes d'un autre service, non comptées`, AUCUNE(), bilan(1, 0, 0, 1)],
    stdoutLacks: ['→ OK'],
  });
}
{
  const name = 'a mixed run → each service its own verdict, exit 1';
  const r = await run(name, {
    scenario: {
      'custody-service': propre('custody-service'),
      'logistics-service': refus(403, [{ code: 10000, message: 'Authentication error' }]),
      'storefront-service': lu({
        events: [...melange(REAL['storefront-service']), { $metadata: { service: 'storefront-service', message: 'request' }, champs: PLANTE }],
      }),
      'offer-service': refus(200, [{ code: 7003, message: 'test: value 70 99 88 77' }]),
      'media-service': { texte: 'test-pas-du-json {' },
      'protection-service': { panne: 'delai' },
    },
  });
  expectRun(name, r, {
    exit: 1,
    stdoutHas: [
      HEAD(6),
      ...blocPropre('custody-service', 3),
      'logistics-service — NON LU : Cloudflare refuse la clé, ou elle n\'a pas le droit de lire les journaux. (HTTP 403 · code 10000 « Authentication error »)',
      `storefront-service — ${lignes(5)} (72 h)`,
      `  téléphone : 9  [${P}.buyerPhone ×1 · ${P}.telephone ×1 · ${P}.x1 ×1 · ${P}.x2 ×1 · ${P}.x3 ×1 · ${P}.x4 ×1 · ${P}.x5 ×1 · ${P}.x6 ×1 · … et 1 autre chemin]`,
      `  e-mail : 2  [${P}.courriel ×1 · ${P}.x8 ×1]`,
      `  point sur la carte : 4  [${P}.latitude ×1 · ${P}.pin ×1 · ${P}.x10 ×1 · ${P}.x9 ×1]`,
      `  code, secret, nom ou adresse : 14  [${P}.adresse ×1 · ${P}.buyerDropCode ×1 · ${P}.buyerName ×1 · ${P}.cfConnectingIp ×1 · ${P}.clientIp ×1 · ${P}.forwardedFor ×1 · ${P}.ip ×1 · ${P}.ipAddress ×1 · … et 6 autres chemins]`,
      `  montant : 4  [${P}.amountFcfa ×1 · ${P}.x11 ×1 · ${P}.x12 ×1 · ${P}.x13 ×1]`,
      '  → À REGARDER',
      'offer-service — NON LU : Cloudflare dit que la demande n\'a pas abouti. (HTTP 200 · code 7003 « [message non affiché] »)',
      'media-service — NON LU : La réponse de Cloudflare ne se lit pas. (HTTP 200)',
      'protection-service — NON LU : Cloudflare n\'a pas répondu (TimeoutError)',
      bilan(6, 1, 1, 4),
      FIN,
    ],
    requests: 6,
  });
}
{
  const name = 'no network → NON LU naming the error’s class only';
  const r = await run(name, { env: { LOG_CHECK_SERVICES: 'media-service' }, scenario: { 'media-service': { panne: 'reseau' } } });
  expectRun(name, r, { exit: 1, stdoutHas: ['media-service — NON LU : Cloudflare n\'a pas répondu (TypeError)', bilan(1, 0, 0, 1)] });
}
{
  const name = 'an HTTP 500 that is not JSON → NON LU with the status only';
  const r = await run(name, { env: { LOG_CHECK_SERVICES: 'media-service' }, scenario: { 'media-service': { status: 500, texte: 'test-pas-du-json {' } } });
  expectRun(name, r, { exit: 1, stdoutHas: ['media-service — NON LU : Cloudflare a répondu une erreur. (HTTP 500)', bilan(1, 0, 0, 1)] });
}
{
  const name = 'a success with no result → NON LU, the shape not understood';
  const r = await run(name, { env: { LOG_CHECK_SERVICES: 'media-service' }, scenario: { 'media-service': lu(null) } });
  expectRun(name, r, { exit: 1, stdoutHas: ['media-service — NON LU : La réponse n\'a pas la forme attendue. (HTTP 200)', bilan(1, 0, 0, 1)] });
}
{
  const name = 'Cloudflare’s errors: at most three, a code only when it is a number, a message only when short, plain and clean';
  const r = await run(name, {
    env: { LOG_CHECK_SERVICES: 'media-service' },
    scenario: {
      'media-service': refus(400, [
        { code: 10001, message: 'test: bad filter' },
        { code: 'x', message: 'x'.repeat(200) },
        { code: 10002, message: 'test\u0007bell' },
        { code: 10003, message: 'test: fourth' },
      ]),
    },
  });
  expectRun(name, r, {
    exit: 1,
    stdoutHas: ['media-service — NON LU : Cloudflare a répondu une erreur. (HTTP 400 · code 10001 « test: bad filter » · code ? « [message non affiché] » · code 10002 « [message non affiché] »)'],
    stdoutLacks: ['x'.repeat(161)],
  });
}
{
  const name = 'a Cloudflare message that repeats the account id is not printed';
  const r = await run(name, {
    env: { LOG_CHECK_SERVICES: 'media-service' },
    scenario: { 'media-service': refus(404, [{ code: 10007, message: `test: account ${ACCOUNT} not found` }]) },
  });
  expectRun(name, r, { exit: 1, stdoutHas: ['media-service — NON LU : Cloudflare a répondu une erreur. (HTTP 404 · code 10007 « [message non affiché] »)'] });
}

for (const [label, env, sentence] of [
  ['no logs key', { CLOUDFLARE_LOGS_TOKEN: undefined }, 'CLOUDFLARE_LOGS_TOKEN manque'],
  ['an empty logs key', { CLOUDFLARE_LOGS_TOKEN: '' }, 'CLOUDFLARE_LOGS_TOKEN manque'],
  ['only the deploy key, never read', { CLOUDFLARE_LOGS_TOKEN: undefined, CLOUDFLARE_API_TOKEN: 'test-deploy-token' }, 'CLOUDFLARE_LOGS_TOKEN manque'],
  ['no account id', { CLOUDFLARE_ACCOUNT_ID: undefined }, 'CLOUDFLARE_ACCOUNT_ID manque'],
  ['an account id that is not one', { CLOUDFLARE_ACCOUNT_ID: 'pas-un-compte' }, 'CLOUDFLARE_ACCOUNT_ID n\'a pas la forme'],
  ['an account id carrying a path', { CLOUDFLARE_ACCOUNT_ID: `${ACCOUNT}/../x` }, 'CLOUDFLARE_ACCOUNT_ID n\'a pas la forme'],
  ['0 hours', { LOG_CHECK_HOURS: '0' }, 'LOG_CHECK_HOURS'],
  ['169 hours', { LOG_CHECK_HOURS: '169' }, 'LOG_CHECK_HOURS'],
  ['hours not a whole number', { LOG_CHECK_HOURS: '72.5' }, 'LOG_CHECK_HOURS'],
  ['hours not a number', { LOG_CHECK_HOURS: 'abc' }, 'LOG_CHECK_HOURS'],
  ['a service name that is no Worker name', { LOG_CHECK_SERVICES: 'Custody Service' }, 'LOG_CHECK_SERVICES'],
  ['a service list with no name in it', { LOG_CHECK_SERVICES: ' , ' }, 'LOG_CHECK_SERVICES'],
]) {
  const name = `${label} → exit 2 with a plain sentence, and no query sent`;
  const r = await run(name, { env, scenario: Object.fromEntries(DEFAUT.map((s) => [s, propre(s)])) });
  expectRun(name, r, { exit: 2, stdout: '', stderrHas: sentence, requests: 0 });
}
{
  const name = 'the script never names the deploy key';
  if (readFileSync(script, 'utf8').includes('CLOUDFLARE_API_TOKEN')) fail(name, 'scripts/log-check.mjs names CLOUDFLARE_API_TOKEN');
  else ok(name);
}

rmSync(work, { recursive: true, force: true });
if (failures.length > 0) {
  console.error(`log-check-proof FAILED — ${failures.length} case(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('log-check-proof OK — a clean line finds nothing, every planted kind is found where it sits, nothing read is never OK, and nothing read is ever printed');
