import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * WO-OPS-1a absence proof (the sera structural pattern): Desk 3 going live must
 * NOT leak into the other seven desks. A desk descriptor is a PURE record — its
 * only import is the shared `./types`; it reaches no spine, no command, no data
 * source. The moderation queue/command is wired ONLY by the router (main.ts),
 * and only under the `moderation` id. Prove the absence structurally.
 */
const srcDir = join(import.meta.dirname, '..', 'src');
const desksDir = join(srcDir, 'desks');
const deskFiles = readdirSync(desksDir).filter(
  (f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'types.ts',
);

describe('desk isolation — Desk 3 is contained; the seven stay honest shells', () => {
  it('there are exactly eight desk descriptor files', () => {
    expect(deskFiles).toHaveLength(8);
  });

  it('every desk descriptor imports ONLY ./types — no spine, no command, no data source', () => {
    for (const file of deskFiles) {
      const src = readFileSync(join(desksDir, file), 'utf8');
      const imports = [...src.matchAll(/^import\s+[^;]*from\s+['"]([^'"]+)['"];/gm)].map((m) => m[1]);
      expect(imports, `${file} imports`).toEqual(['./types']);
      // scan CODE only (comments may legitimately reference the spine by name)
      const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(
        codeOnly,
        `${file} code must not reach live wiring`,
      ).not.toMatch(/moderation\/|maker-checker|audit-log|@platform\/contracts|fetch\(|XMLHttpRequest|WebSocket|indexedDB|localStorage/);
    }
  });

  it('live desks are wired ONLY through the router; every other desk gets the empty shell', () => {
    const main = readFileSync(join(srcDir, 'main.ts'), 'utf8');
    expect(main).toMatch(/desk\.id === 'moderation'/);
    expect(main).toMatch(/renderModerationQueue\(/);
    expect(main).toMatch(/desk\.id === 'reconciliation-operateur'/);
    expect(main).toMatch(/renderBreakGlassBoard\(/);
    expect(main).toMatch(/desk\.id === 'echelle-de-refus'/);
    expect(main).toMatch(/renderRefusalLadder\(/);
    expect(main).toMatch(/renderEmptyShell\(\)/);
    // EXACTLY three desks go live; the remaining five fall to the shell.
    const liveBranches = [...main.matchAll(/desk\.id === '([^']+)'/g)].map((m) => m[1]).sort();
    expect(liveBranches).toEqual(['echelle-de-refus', 'moderation', 'reconciliation-operateur']);
  });

  it('no desk descriptor reaches a command module (moderation/ or breakglass/) (imports)', () => {
    for (const file of deskFiles) {
      const src = readFileSync(join(desksDir, file), 'utf8');
      const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(
        codeOnly.includes('moderation/') || codeOnly.includes('breakglass/'),
        `${file} code must not import a command module`,
      ).toBe(false);
    }
  });

  it('DESK 6 refusal surface is RENDER-ONLY — no command, no lever, no write (« vue sans levier »; a planted mutation lever fails here)', () => {
    const rfDir = join(srcDir, 'refusal');
    for (const file of readdirSync(rfDir).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(rfDir, file), 'utf8');
      const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // no command machinery: no maker-checker, no OpsActionType, no issue/approve lever
      expect(
        codeOnly,
        `${file} code reaches a command/lever`,
      ).not.toMatch(/maker-checker|ops-action|OpsAction|OPS_ACTION|\bissue[A-Za-z]*\(|\bapprove[A-Za-z]*\(/);
      // no write path / side channel / logging
      expect(
        codeOnly,
        `${file} code has a write path`,
      ).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|indexedDB|localStorage|console\.(log|info|warn|error|debug)/);
    }
    // the read model imports the canon shape as a TYPE only — no runtime schema,
    // so it structurally cannot construct or mutate anything.
    const ladder = readFileSync(join(rfDir, 'ladder.ts'), 'utf8');
    const ladderContractsImports = [
      ...ladder.matchAll(/^import\s+([^;]*?)\s+from\s+'@platform\/contracts';/gm),
    ];
    expect(ladderContractsImports, 'ladder.ts imports exactly one contracts line').toHaveLength(1);
    expect(ladderContractsImports[0]![1], 'ladder.ts must import type-only from canon').toMatch(
      /^type\b/,
    );
  });

  it('THE FOURTH SECRET is structurally absent from the break-glass surface (no signature in code, no logging)', () => {
    const bgDir = join(srcDir, 'breakglass');
    for (const file of readdirSync(bgDir).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(bgDir, file), 'utf8');
      const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // the signature (fourth secret) is not in this slice's data — no field, no render, no reference
      expect(/signature/i.test(codeOnly), `${file} code references a signature`).toBe(false);
      // no console logging anywhere on the break-glass surface
      expect(codeOnly, `${file} logs`).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });
});
