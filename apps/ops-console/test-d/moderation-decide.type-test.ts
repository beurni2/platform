/**
 * moderation:decide — COMPILE-LEVEL guard + DEBT ① written down (WO-OPS-1a).
 *
 * The maker-checker `DistinctChecker` guard flows THROUGH
 * `approveModerationDecision`, so the SAME operator approving his own decision
 * does not compile — FOR LITERAL identity types (proven by the @ts-expect-error
 * below; if it compiled, the unused directive would fail the typecheck gate).
 *
 * DEBT ①, IN FORCE: real operator ids arrive from a session token as `string`.
 * `string extends string` is TRUE, so `DistinctChecker<string,string>` collapses
 * to `never` and every real call MUST cast the checker — after which the compile
 * guard is VACUOUS and the RUNTIME identity check in approve() is the ONLY guard.
 * That runtime guard is proven on the REAL command under a full `any` bypass in
 * test/moderation-decide.test.ts ("DEBT ①"). Do not read two production layers
 * where there is one.
 */
import type { ModerationDecision } from '@platform/contracts';
import { actor } from '../src/maker-checker';
import { issueModerationDecision, approveModerationDecision } from '../src/moderation/decide';

const opsA = actor('ops:moderation:diallo');
const opsB = actor('ops:moderation:kabore');
const decision: ModerationDecision = { decision: 'approved', decided_by: 'ops:moderation:diallo' };
const issued = issueModerationDecision(opsA, {
  listingId: 'listing:x',
  decision,
  correlationId: 'c',
  serverTime: 't',
});

// A DIFFERENT operator approves — MUST compile.
const ok = approveModerationDecision(issued, opsB, { correlationId: 'c', serverTime: 't' });

// The SAME operator cannot approve his own decision — MUST NOT compile
// (DistinctChecker collapses the checker parameter to `never`).
// @ts-expect-error same identity cannot both decide and approve a moderation command
const bad = approveModerationDecision(issued, opsA, { correlationId: 'c', serverTime: 't' });

export { ok, bad };
