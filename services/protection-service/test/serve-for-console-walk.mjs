/**
 * The REAL protection-service bundle on workerd, for the ops console's fund
 * desk walk (apps/ops-console/e2e/fonds-live.spec.ts). Started by the console's
 * Playwright config; not a vitest file.
 *
 * Two real Workers answer on the one port the walk's console is built for:
 *  · this release (dist/worker/worker.mjs) for the walk key;
 *  · the previous release, frozen at platform main ae0b76e
 *    (test/fixtures/main-ae0b76e/), for the previous-release walk key — so
 *    the walk can drive the desk against the service it may meet after a
 *    rollback or a deploy out of order.
 * The front only chooses which Worker gets a request, by its Bearer key
 * (a request with no key, such as a CORS preflight, goes to this release —
 * both releases have the same CORS door). It passes method, headers, body and
 * the answer through untouched; it never answers anything itself.
 *
 * Bounds: in-memory books (a fresh, empty fund for each Worker on every start)
 * · 127.0.0.1 only · TEST keys, never real ones · CORS opened to the walk's
 * console origin only. It needs `pnpm build` first (CI's order): this
 * release's bundle is dist/worker/worker.mjs.
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// The test keys the walk types into the key door (fonds-live.spec.ts).
const WALK_KEY = 'test-fonds-walk-key-0001';
const PREVIOUS_WALK_KEY = 'test-fonds-walk-key-prev';
const CONSOLE_ORIGIN = 'http://127.0.0.1:4275';
const PORT = 4276;

// workerd resolves modules under its working directory, so run from the
// package root, exactly as the package's own e2e tests do.
process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));
const scriptPath = 'dist/worker/worker.mjs';
if (!existsSync(scriptPath)) {
  console.error(`protection-service bundle missing at ${scriptPath} — run pnpm build first`);
  process.exit(1);
}
// The previous release, bundled with the package's own bundle flags.
const previousScript = 'dist/test-bundles/walk-main-ae0b76e.mjs';
await build({
  entryPoints: [join(process.cwd(), 'test/fixtures/main-ae0b76e/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  conditions: ['import'],
  absWorkingDir: process.cwd(),
  outfile: previousScript,
  define: { __PLATFORM_RELEASE__: "'dev'", __PLATFORM_CANON__: "'dev'" },
  logLevel: 'silent',
});

const worker = (script, key) =>
  new Miniflare({
    modules: true,
    scriptPath: script,
    durableObjects: { FONDS: 'FondsDO' },
    bindings: { PROTECTION_OPS_SECRET: key, PROTECTION_CONSOLE_ORIGIN: CONSOLE_ORIGIN },
    host: '127.0.0.1',
    port: 0,
  });
const current = worker(scriptPath, WALK_KEY);
const previous = worker(previousScript, PREVIOUS_WALK_KEY);
await Promise.all([current.ready, previous.ready]);

const front = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const target = req.headers.authorization === `Bearer ${PREVIOUS_WALK_KEY}` ? previous : current;
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    const method = req.method ?? 'GET';
    const answer = await target.dispatchFetch(`http://127.0.0.1:${PORT}${req.url}`, {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
    });
    res.writeHead(answer.status, Object.fromEntries(answer.headers));
    res.end(Buffer.from(await answer.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(502).end();
  }
});
front.listen(PORT, '127.0.0.1', () => console.log(`protection-service (walk) on http://127.0.0.1:${PORT}`));

const stop = async () => {
  front.close();
  await Promise.all([current.dispose(), previous.dispose()]).catch(() => undefined);
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
