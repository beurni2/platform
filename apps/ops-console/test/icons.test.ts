import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { opsIcon, OPS_ICON_NAMES } from '../src/icons';

/**
 * The ops console consumes canon's 29-icon set (pin ba6f16d / v0.9.6; byte-identical
 * across v0.9.1→v0.9.6) as inline
 * SVG strings. This proves the embedded glyphs are BYTE-IDENTICAL to canon: each
 * embedded string's sha256 equals assets/icons/icons.manifest.json, whose entries
 * are canon's own. No hand-editing can drift a glyph without turning this red.
 */
const iconsDir = join(import.meta.dirname, '..', 'assets', 'icons');
const manifest = JSON.parse(readFileSync(join(iconsDir, 'icons.manifest.json'), 'utf8'));

describe('the 29 Grand Teint glyphs — byte-faithful to canon', () => {
  it('carries exactly the 29 canonical glyphs; names == manifest', () => {
    expect(OPS_ICON_NAMES).toHaveLength(29);
    expect(Object.keys(opsIcon)).toHaveLength(29);
    expect([...OPS_ICON_NAMES].sort()).toEqual(Object.keys(manifest.icons).sort());
  });

  it('every embedded glyph is byte-identical to canon (sha256 + byte length == manifest)', () => {
    for (const name of OPS_ICON_NAMES) {
      const bytes = Buffer.from(opsIcon[name], 'utf8');
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(sha, `${name}: sha256 must match canon manifest`).toBe(manifest.icons[name].sha256);
      expect(bytes.length, `${name}: byte length must match canon manifest`).toBe(
        manifest.icons[name].bytes,
      );
    }
  });

  it('every glyph paints via currentColor and hardcodes no colour', () => {
    for (const name of OPS_ICON_NAMES) {
      const svg = opsIcon[name];
      expect(svg, `${name}: drives colour from currentColor`).toContain('currentColor');
      expect(svg, `${name}: no hardcoded hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg, `${name}: no rgb()/hsl()`).not.toMatch(/\brgba?\(|\bhsla?\(/);
    }
  });

  it('every glyph is well-formed inline SVG (xmlns, viewBox, no namespace prefix)', () => {
    for (const name of OPS_ICON_NAMES) {
      const svg = opsIcon[name];
      expect(svg, `${name}: root <svg> declares xmlns`).toMatch(/<svg\b[^>]*\sxmlns=/);
      expect(svg, `${name}: viewBox 0 0 24 24`).toContain('viewBox="0 0 24 24"');
      expect(svg, `${name}: no ns0: prefix a DOM would drop`).not.toMatch(/<ns\d+:|xmlns:/);
    }
  });
});
