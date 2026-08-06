import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * FONDS-2 key discipline (verifier round 1, note 8): the fonds surface holds
 * the founder's ops key in PAGE MEMORY ONLY — a module variable for the
 * session. No browser persistence API may ever touch it (or anything else in
 * this desk): a key in localStorage outlives the session and every tab, and
 * would pass every other gate silently. Enforced structurally, like the
 * desk-isolation scans.
 */
const fondsDir = join(import.meta.dirname, '..', 'src', 'fonds');
const files = readdirSync(fondsDir).filter((f) => f.endsWith('.ts'));

const FORBIDDEN = [
  'localStorage',
  'sessionStorage',
  'document.cookie',
  'indexedDB',
  'caches.',
  'BroadcastChannel',
];

describe('fonds desk — the ops key never touches a persistence API', () => {
  it('covers the whole fonds module', () => {
    expect(files.length).toBeGreaterThanOrEqual(5); // port, sandbox, view, http, live
  });

  it.each(files)('%s uses no browser persistence API (code, comments stripped)', (file) => {
    const src = readFileSync(join(fondsDir, file), 'utf8');
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const token of FORBIDDEN) {
      expect(codeOnly.includes(token), `${file} must not use ${token}`).toBe(false);
    }
  });

  it('the key lives in a plain module variable, cleared on 401', () => {
    const live = readFileSync(join(fondsDir, 'live.ts'), 'utf8');
    expect(live).toMatch(/let sessionKey: string \| null = null;/);
    // the 401 paths reset it — a wrong key never half-opens the desk
    expect(live.match(/sessionKey = null/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
