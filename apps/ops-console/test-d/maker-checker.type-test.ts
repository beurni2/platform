/**
 * Maker-checker COMPILE-LEVEL impossibility (WO-OPS-0). Checked by
 * `tsc -p tsconfig.typetest.json`; if the @ts-expect-error line below WERE to
 * compile, the now-unused directive itself becomes a compile error and the
 * typecheck gate fails. A same-identity approval must NOT be constructable at
 * the type level — not merely warned about.
 */
import type { EventEnvelope } from '@platform/contracts';
import { actor, issue, approve } from '../src/maker-checker';
import { OPS_ACTION_PENDING } from '../src/ops-action';

const env = (who: string): EventEnvelope => ({
  command_id: 'c',
  correlation_id: 'c',
  aggregateVersion: 0,
  actor: who,
  serverTime: 't',
  version: '1',
});

const alice = actor('alice');
const bob = actor('bob');
const issued = issue(alice, {
  action: OPS_ACTION_PENDING,
  reason: 'r',
  entity: 'e',
  envelope: env('alice'),
});

// A DIFFERENT identity approves — this MUST compile.
const ok = approve(issued, bob, env('bob'));

// The SAME identity cannot approve — this MUST NOT compile: `approve`'s checker
// parameter is `never` when the checker's identity equals the maker's.
// @ts-expect-error same identity cannot both issue and approve a command
const bad = approve(issued, alice, env('alice'));

export { ok, bad };
