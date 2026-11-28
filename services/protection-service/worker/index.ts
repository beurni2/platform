/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 */

/**
 * protection-service Worker entry (FONDS-1).
 *
 * ONE DOOR: every route except GET /health requires the founder's
 * `PROTECTION_OPS_SECRET` as a Bearer token — a wrangler SECRET, NEVER a
 * `[vars]` entry (this repo is public; a var would be published). FAIL CLOSED:
 * a Worker deployed before the secret is set refuses everything, loudly.
 *
 * The auth primitive is MIRRORED from `@boutik/service-auth` (that package is
 * a boutik-plus workspace package, not on any registry, so it cannot be
 * consumed here): the same HMAC-keyed constant-time comparison, the same
 * unconditional compare (timing never reveals whether a secret exists), the
 * same single identical 401 for every rejection.
 *
 * CORS: the consoles are browser apps on their own origins. EXACT-ORIGIN
 * ALLOWLIST (`PROTECTION_CONSOLE_ORIGIN`, a var — origins are public;
 * comma-separated since FONDS-CONSOLE-B+, when the founder ordered the fund
 * desk into his Boutik+ console alongside the platform console), mirroring
 * the shop-plus storefront-service ruling: no wildcard, ever — the response
 * echoes the ONE requesting origin iff it is on the list. Unset → no CORS
 * headers (curl still works; browsers are refused).
 *
 * LOG: every request writes ONE line once its answer is ready (or once it
 * throws): the route's template, the method, the status, the time taken, a
 * correlation id. Never an amount, a reason, a reference, a key, the raw path
 * or the query — this book records money the founder moved outside, and a log
 * that repeated it would be a second, unguarded copy (Laws 2 and 4).
 */

import { FondsDO, FONDS_BOOK_NAME } from './fund-do.js';
import { writeLine, type Level } from './log.js';

export { FondsDO };

// SERVICE-PROVENANCE (the F9 lesson): the deploy workflow stamps the bundle,
// /health answers with it, and the post-deploy assertion polls until the live
// Worker IS this build. esbuild --define; 'dev' outside the workflow.
declare const __PLATFORM_RELEASE__: string;
declare const __PLATFORM_CANON__: string;

export interface Env {
  readonly FONDS: DurableObjectNamespace;
  readonly PROTECTION_OPS_SECRET?: string;
  readonly PROTECTION_CONSOLE_ORIGIN?: string;
}

const BEARER_PREFIX = 'Bearer ';

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const [da, db] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i += 1) diff |= (va[i] as number) ^ (vb[i] as number);
  return diff === 0;
}

/** The one 401 — IDENTICAL for every rejection, so it can never leak. */
function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

async function authorized(request: Request, secret: string | undefined): Promise<boolean> {
  const configured = secret ?? '';
  const header = request.headers.get('Authorization') ?? '';
  const provided = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : '';
  // The compare runs unconditionally so timing does not reveal whether a
  // secret exists; the length guard keeps it fail-closed.
  const match = await timingSafeEqual(provided, configured);
  return configured.length > 0 && match;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = (env.PROTECTION_CONSOLE_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (allowed.length === 0) return {};
  const requesting = request.headers.get('Origin') ?? '';
  // Echo the ONE requesting origin iff allowlisted — never a wildcard, never
  // a different origin than the one asking, never a list on the wire.
  if (!allowed.includes(requesting)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': requesting,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    Vary: 'Origin',
  };
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = corsHeaders(request, env);
  if (Object.keys(headers).length === 0) return response;
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

const CORRELATION_ID_MAX = 64;
const METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const ROUTES: ReadonlySet<string> = new Set(['/health', '/claims', '/fund', '/journal']);
const ADVANCE = /^\/claims\/([^/]+)\/advance$/;
// Shop+ mints every order id as `ord-` + its quote id. Any other segment is
// not an order id this book can name, so the line never repeats it.
const ORDER_ID_MINTED = /^ord-quote-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function routeOf(pathname: string): { route: string; orderId?: string } {
  if (ROUTES.has(pathname)) return { route: pathname };
  const advance = ADVANCE.exec(pathname);
  if (advance === null) return { route: 'unmatched' };
  // The raw segment, never a decoded one: a decoded id is not what was minted.
  const segment = advance[1] as string;
  return ORDER_ID_MINTED.test(segment)
    ? { route: '/claims/:orderId/advance', orderId: segment }
    : { route: '/claims/:orderId/advance' };
}

function levelOf(status: number): Level {
  if (status >= 500) return 'error';
  if (status === 401 || status === 403 || status === 413 || status === 429) return 'warn';
  return 'info';
}

function correlationIdOf(request: Request): string {
  const inbound = request.headers.get('x-correlation-id');
  return inbound === null || inbound === '' ? crypto.randomUUID() : inbound.slice(0, CORRELATION_ID_MAX);
}

function logRequest(request: Request, started: number, outcome: { status: number } | { error: unknown }): void {
  const { route, orderId } = routeOf(new URL(request.url).pathname);
  // A throw reaches the caller as the runtime's own 500.
  const status = 'status' in outcome ? outcome.status : 500;
  writeLine(levelOf(status), correlationIdOf(request), 'request', {
    route,
    method: METHODS.has(request.method) ? request.method : 'OTHER',
    status,
    durationMs: Date.now() - started,
    ...(orderId !== undefined ? { orderId } : {}),
    // The class only: a message can carry the very data this line must not.
    ...('error' in outcome ? { error: outcome.error instanceof Error ? outcome.error.constructor.name : 'unknown' } : {}),
  });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    // Unauthenticated liveness for the post-deploy provenance probe — no
    // fund data, no claim data, nothing enumerable.
    return withCors(
      Response.json({
        ok: true,
        service: 'protection-service',
        release: __PLATFORM_RELEASE__,
        canon: __PLATFORM_CANON__,
      }),
      request,
      env,
    );
  }
  if (!(await authorized(request, env.PROTECTION_OPS_SECRET))) {
    return withCors(unauthorized(), request, env);
  }
  const stub = env.FONDS.get(env.FONDS.idFromName(FONDS_BOOK_NAME));
  return withCors(await stub.fetch(request), request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    try {
      const response = await handle(request, env);
      logRequest(request, started, { status: response.status });
      return response;
    } catch (error) {
      logRequest(request, started, { error });
      throw error;
    }
  },
};
