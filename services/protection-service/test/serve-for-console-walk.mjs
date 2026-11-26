/**
 * The REAL protection-service bundle on workerd, for the ops console's fund
 * desk walk (apps/ops-console/e2e/fonds-live.spec.ts). Started by the console's
 * Playwright config; not a vitest file.
 *
 * Bounds: in-memory book (a fresh, empty fund on every start) · 127.0.0.1
 * only · a TEST key, never a real one · CORS opened to the walk's console
 * origin only. It needs `pnpm build` first (CI's order): the bundle is
 * dist/worker/worker.mjs.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

// The same test key the walk types into the key door (fonds-live.spec.ts).
const WALK_KEY = 'test-fonds-walk-key-0001';
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

const mf = new Miniflare({
  modules: true,
  scriptPath,
  durableObjects: { FONDS: 'FondsDO' },
  bindings: { PROTECTION_OPS_SECRET: WALK_KEY, PROTECTION_CONSOLE_ORIGIN: CONSOLE_ORIGIN },
  host: '127.0.0.1',
  port: PORT,
});
const url = await mf.ready;
console.log(`protection-service (walk) on ${url.origin}`);

const stop = async () => {
  await mf.dispose().catch(() => undefined);
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
