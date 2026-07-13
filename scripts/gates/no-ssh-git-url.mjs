#!/usr/bin/env node
// WO-OPS-0.1 — lockfile URL-form gate (DEFENSE IN DEPTH). Canon v0.9.4 carries
// the STANDING-LAW version of this gate (the authoritative one, in
// platform-contracts); this repo asserts it again on its own committed
// pnpm-lock.yaml. pnpm can rewrite git-dep URLs to scp/ssh forms, which then
// need SSH credentials CI does not have and which hide the pinned https ref.
// Every git dep must stay https. Zero SSH-form git URLs.
//   usage: node scripts/gates/no-ssh-git-url.mjs [lockfile]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = process.argv[2] ?? join(root, 'pnpm-lock.yaml');
const text = readFileSync(target, 'utf8');

const forbidden = [
  { name: 'scp-form git@github.com:', re: /git@github\.com:/ },
  { name: 'ssh:// git url', re: /ssh:\/\/git@/ },
];

const hits = [];
text.split('\n').forEach((line, i) => {
  for (const f of forbidden) {
    if (f.re.test(line)) hits.push(`${target}:${i + 1}: ${f.name} — ${line.trim()}`);
  }
});

if (hits.length) {
  console.error(`lockfile URL-form gate FAILED — SSH-form git URLs are forbidden (${hits.length}):`);
  for (const h of hits) console.error('  - ' + h);
  process.exit(1);
}
console.log(`lockfile URL-form gate OK: ${target} carries zero SSH-form git URLs (all https)`);
