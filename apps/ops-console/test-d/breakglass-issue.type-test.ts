/**
 * breakglass:issue — COMPILE-LEVEL guard (WO-OPS-1b). The maker-checker
 * `DistinctChecker` guard flows through `approveBreakGlass`: the SAME payment
 * operator approving his own request does not compile for LITERAL ids (proven by
 * @ts-expect-error). DEBT ① remains in force — for runtime `string` ids the guard
 * is vacuous; the runtime allow-list + same-identity check are the live guards
 * (proven in test/breakglass-issue.test.ts).
 */
import {
  issueBreakGlass,
  approveBreakGlass,
  type BreakGlassRequest,
} from '../src/breakglass/issue';
import { actor } from '../src/maker-checker';

const opsA = actor('ops:payment:sanou');
const opsB = actor('ops:payment:zerbo');
const req: BreakGlassRequest = {
  orderId: 'o',
  riderId: 'r',
  buyerRef: 'b',
  exactAmount: 1,
  providerTransactionReference: 'p',
  breakGlassCaseId: 'c',
  reason: 'x',
  authorizationExpiresAt: 't',
};
const issued = issueBreakGlass(opsA, { ...req, correlationId: 'c', serverTime: 't' });

// A DIFFERENT operator approves — MUST compile.
const ok = approveBreakGlass(issued, opsB, { correlationId: 'c', serverTime: 't' });

// The SAME operator cannot approve his own request — MUST NOT compile.
// @ts-expect-error same identity cannot both request and approve a break-glass issuance
const bad = approveBreakGlass(issued, opsA, { correlationId: 'c', serverTime: 't' });

export { ok, bad };
