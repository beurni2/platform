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
 */

import { FondsDO, FONDS_BOOK_NAME } from './fund-do.js';

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
  },
};
