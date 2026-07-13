import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CatalogSchema } from '@platform/i18n';
import { DESKS } from '../src/desks';
import { OPS_ICON_NAMES } from '../src/icons';

const catalog = CatalogSchema.parse(
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'i18n/catalog.json'), 'utf8')),
);
const keys = new Set(catalog.map((e) => e.key));

describe('the eight desks (canon ECOSYSTEM-MASTER-REFERENCE §9.2)', () => {
  it('there are exactly eight, in canon order (Desk 1 → 8)', () => {
    expect(DESKS).toHaveLength(8);
    expect(DESKS.map((d) => d.id)).toEqual([
      'fonds-de-protection',
      'reclamations',
      'moderation',
      'confiance-securite',
      'reconciliation-operateur',
      'echelle-de-refus',
      'flags-kill-switches',
      'journal-audit',
    ]);
  });

  it('every desk has a catalog title, a real canon glyph, and a unique id', () => {
    const ids = new Set<string>();
    for (const desk of DESKS) {
      expect(keys.has(desk.titleKey), `${desk.id} title in catalog`).toBe(true);
      expect(OPS_ICON_NAMES, `${desk.id} glyph in canon set`).toContain(desk.glyph);
      expect(ids.has(desk.id), `${desk.id} unique`).toBe(false);
      ids.add(desk.id);
    }
  });

  it('the honest empty-state string exists in the catalog', () => {
    expect(keys.has('desk.empty_state')).toBe(true);
  });
});
