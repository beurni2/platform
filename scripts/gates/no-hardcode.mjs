#!/usr/bin/env node
// WO-OPS-0 zero-hardcode scan (applies from commit one). App styling must come
// from @platform/ui-tokens — no literal colours or lengths in src. Scans .ts
// files (comments stripped) and flags hex colours, rgb()/hsl(), and px/rem
// literals. The generated icon module (byte-verbatim canon SVGs, proven by
// icons.test.ts) is exempt. Structural units (%, vh, vw, fr, auto) are allowed:
// they name no design-token value and the token set has no equivalent.
//   usage: node scripts/gates/no-hardcode.mjs [target-dir-or-file]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = process.argv[2] ?? join(root, 'apps', 'ops-console', 'src');

function tsFiles(path) {
  if (statSync(path).isFile()) return path.endsWith('.ts') ? [path] : [];
  const out = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const rules = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: 'rgb()/rgba()', re: /\brgba?\(/ },
  { name: 'hsl()/hsla()', re: /\bhsla?\(/ },
  { name: 'px literal', re: /\b\d+(?:\.\d+)?px\b/ },
  { name: 'rem literal', re: /\b\d+(?:\.\d+)?rem\b/ },
];

const files = tsFiles(target);
const problems = [];
for (const file of files) {
  if (file.endsWith('icons.ts')) continue; // generated, byte-verbatim canon SVGs
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  src.split('\n').forEach((line, i) => {
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (m) problems.push(`${file}:${i + 1}: ${rule.name} « ${m[0]} »`);
    }
  });
}

if (problems.length) {
  console.error('zero-hardcode scan FAILED — styling must come from @platform/ui-tokens:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`zero-hardcode scan OK: ${files.length} src file(s), no literal colours or lengths`);
