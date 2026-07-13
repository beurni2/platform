import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CatalogSchema } from '@platform/i18n';

const appDir = join(import.meta.dirname, '..');
const srcDir = join(appDir, 'src');
const catalog = CatalogSchema.parse(
  JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')),
);

/** Every .ts file under src/, recursively. */
function srcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...srcFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
const files = srcFiles(srcDir);

describe('ops-console catalog + no inline French', () => {
  it('parses under the canon CatalogSchema (register + screenClass tags)', () => {
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('every t() key used in src exists in the catalog', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const used: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      used.push(...[...source.matchAll(/(?<![\w.])t\('([^']+)'\)/g)].map((m) => m[1] ?? ''));
    }
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) {
      expect(keys.has(key), `missing catalog key: ${key}`).toBe(true);
    }
  });

  it('no source file carries inline French (strings live in the catalog, never inline)', () => {
    for (const file of files) {
      if (file.endsWith('icons.ts')) continue; // generated, byte-verbatim canon SVGs
      const source = readFileSync(file, 'utf8');
      const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(codeOnly, `inline French in ${file}`).not.toMatch(
        /['"«][^'"»]*[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/,
      );
    }
  });

  it('the shell has no runtime import of node-only canon barrels', () => {
    const source = readFileSync(join(srcDir, 'i18n.ts'), 'utf8');
    const runtimeImports = [
      ...source.matchAll(/^import (?!type )[^;]*from ['"]([^'"]+)['"];/gm),
    ].map((m) => m[1] ?? '');
    for (const spec of runtimeImports) {
      expect(spec, `src/i18n.ts runtime-imports ${spec}`).not.toMatch(/@platform\/i18n/);
    }
  });
});
