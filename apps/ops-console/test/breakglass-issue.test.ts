import { describe, it, expect } from 'vitest';
import { CommandIdSchema } from '@platform/contracts';
import {
  actor,
  MakerCheckerError,
  MakerCheckerSameIdentityError,
} from '../src/maker-checker';
import {
  issueBreakGlass,
  approveBreakGlass,
  BreakGlassActorError,
  type BreakGlassRequest,
} from '../src/breakglass/issue';

// Two DIFFERENT payment operators — the ONLY actor class that validates
// (founder ruling: allow-list ^ops:payment:[A-Za-z0-9._:-]+$).
const opsA = actor('ops:payment:sanou');
const opsB = actor('ops:payment:zerbo');

// Every other actor is refused by NON-MATCH — no block-list. Fixtures are real:
//   - a supplier actor
//   - sera's REAL dispatcher actor literal (grepped from shipped sera code)
//   - a cross-domain ops:moderation:* actor (Desk 3's operators cannot issue break-glass)
//   - an empty-suffix ops:payment:
const REFUSED = [
  'supplier:aicha',
  'logistics-service:dispatch',
  'ops:moderation:diallo',
  'ops:payment:',
] as const;

const REQUEST: BreakGlassRequest = {
  orderId: 'order-o1',
  riderId: 'rider-r1',
  buyerRef: 'buyer-b1',
  exactAmount: 12500,
  providerTransactionReference: 'prov-tx-abc',
  breakGlassCaseId: 'case-bg1',
  reason: 'Webhook manquant; paiement vérifié par téléphone auprès du réseau.',
  authorizationExpiresAt: '2026-07-13T12:00:00.000Z',
};
const issueIn = (r: BreakGlassRequest = REQUEST) => ({
  ...r,
  correlationId: 'corr-bg-1',
  serverTime: '2026-07-13T10:00:00.000Z',
});
const approveIn = () => ({ correlationId: 'corr-bg-1', serverTime: '2026-07-13T10:05:00.000Z' });

describe('WO-OPS-1b — the issuing half of break-glass (breakglass:issue)', () => {
  it('two DIFFERENT payment operators: first requests, second approves — succeeds', () => {
    const issued = issueBreakGlass(opsA, issueIn());
    expect(issued.command.action).toBe('breakglass:issue');
    expect(issued.request.breakGlassCaseId).toBe('case-bg1');
    expect(issued.request.exactAmount).toBe(12500); // operators verify the amount
    expect(CommandIdSchema.safeParse(issued.command.envelope.command_id).success).toBe(true);
    const approved = approveBreakGlass(issued, opsB, approveIn());
    expect(approved.command.command.maker.id).toBe('ops:payment:sanou');
    expect(approved.command.checker.id).toBe('ops:payment:zerbo');
  });

  it('ALLOW-LIST at ISSUE: every non ops:payment:* actor is refused', () => {
    for (const bad of REFUSED) {
      const badMaker = actor(bad);
      expect(() => issueBreakGlass(badMaker, issueIn()), `issue by ${bad}`).toThrow(
        BreakGlassActorError,
      );
    }
  });

  it('ALLOW-LIST at APPROVE: every non ops:payment:* actor is refused', () => {
    const issued = issueBreakGlass(opsA, issueIn());
    for (const bad of REFUSED) {
      const badChecker = actor(bad) as unknown as typeof opsB;
      expect(() => approveBreakGlass(issued, badChecker, approveIn()), `approve by ${bad}`).toThrow(
        BreakGlassActorError,
      );
    }
  });

  it('the maker-checker seam holds: same identity refused at runtime under a full `any` bypass', () => {
    const issued = issueBreakGlass(opsA, issueIn());
    const sameAsMaker: unknown = opsA;
    expect(() => approveBreakGlass(issued, sameAsMaker as typeof opsB, approveIn())).toThrow(
      MakerCheckerSameIdentityError,
    );
  });

  it('DEBT ② carried forward: a forged maker envelope is refused at approve', () => {
    const issued = issueBreakGlass(opsA, issueIn());
    // tamper the issued command's envelope actor (a forged command)
    const forged = {
      ...issued,
      command: { ...issued.command, envelope: { ...issued.command.envelope, actor: 'ops:payment:EVIL' } },
    };
    expect(() => approveBreakGlass(forged, opsB, approveIn())).toThrow(MakerCheckerError);
  });

  it('break_glass REQUIRES a breakGlassCaseId (mandatory incident review)', () => {
    const noCase = { ...REQUEST, breakGlassCaseId: '' };
    expect(() => issueBreakGlass(opsA, issueIn(noCase))).toThrow();
  });

  it('exactAmount is validated by canon FcfaSchema (a bad amount is refused)', () => {
    const badAmount = { ...REQUEST, exactAmount: -1 };
    expect(() => issueBreakGlass(opsA, issueIn(badAmount))).toThrow();
    const fractional = { ...REQUEST, exactAmount: 12500.5 };
    expect(() => issueBreakGlass(opsA, issueIn(fractional))).toThrow();
  });

  it('the request carries NO signature (the fourth secret is not in this slice’s data at all)', () => {
    const issued = issueBreakGlass(opsA, issueIn());
    expect('signature' in issued.request).toBe(false);
    expect(JSON.stringify(issued)).not.toContain('signature');
  });
});
