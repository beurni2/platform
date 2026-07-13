import { describe, it, expect } from 'vitest';
import { CommandIdSchema, type ModerationDecision } from '@platform/contracts';
import {
  actor,
  MakerCheckerError,
  MakerCheckerSameIdentityError,
  type IssuedCommand,
} from '../src/maker-checker';
import {
  issueModerationDecision,
  approveModerationDecision,
  ModerationActorError,
  type IssuedModerationCommand,
} from '../src/moderation/decide';

// Two DIFFERENT ops:moderation operators (canon requires ops:moderation:* actors).
const opsA = actor('ops:moderation:diallo');
const opsB = actor('ops:moderation:kabore');

const approved = (by: string): ModerationDecision => ({ decision: 'approved', decided_by: by });
const changes = (by: string): ModerationDecision => ({
  decision: 'changes_requested',
  reasons: ['price_or_contact_in_image'],
  decided_by: by,
});
const issueIn = (decision: ModerationDecision) => ({
  listingId: 'listing:soap-01',
  decision,
  correlationId: 'corr-mod-1',
  serverTime: '2026-07-13T10:00:00.000Z',
});
const approveIn = () => ({ correlationId: 'corr-mod-1', serverTime: '2026-07-13T10:05:00.000Z' });

describe('Desk 3 — the first real ops command (moderation:decide)', () => {
  it('a two-operator decision succeeds: maker decides, a DIFFERENT operator approves', () => {
    const issued = issueModerationDecision(opsA, issueIn(approved('ops:moderation:diallo')));
    expect(issued.command.action).toBe('moderation:decide');
    expect(issued.decision.decision).toBe('approved');
    // command_id was MINTED as a UUIDv4 (canon v0.9.5 mint rule), not fabricated
    expect(CommandIdSchema.safeParse(issued.command.envelope.command_id).success).toBe(true);
    const decided = approveModerationDecision(issued, opsB, approveIn());
    expect(decided.command.command.maker.id).toBe('ops:moderation:diallo');
    expect(decided.command.checker.id).toBe('ops:moderation:kabore');
    expect(decided.listingId).toBe('listing:soap-01');
  });

  it('a SUPPLIER actor is refused at ISSUE (canon: decided_by must be ops:moderation:*)', () => {
    const supplier = actor('supplier:aicha');
    expect(() =>
      issueModerationDecision(supplier, issueIn(approved('supplier:aicha'))),
    ).toThrow();
  });

  it('a maker whose id != decision.decided_by is refused at ISSUE (no proxying another operator)', () => {
    expect(() =>
      issueModerationDecision(opsA, issueIn(approved('ops:moderation:someone-else'))),
    ).toThrow(ModerationActorError);
  });

  it('a SUPPLIER actor is refused at APPROVE (supplier can never be the second operator)', () => {
    const issued = issueModerationDecision(opsA, issueIn(approved('ops:moderation:diallo')));
    const supplierAsChecker = actor('supplier:aicha') as unknown as typeof opsB;
    expect(() => approveModerationDecision(issued, supplierAsChecker, approveIn())).toThrow(
      ModerationActorError,
    );
  });

  it('DEBT ①: on a REAL command, same-identity approve is refused at RUNTIME under a full `any` bypass — production rests on this alone (the compile guard is vacuous for string ids)', () => {
    const issued = issueModerationDecision(opsA, issueIn(approved('ops:moderation:diallo')));
    // A session-token id is a `string` at runtime; the type guard cannot see it.
    // This is exactly what a real call looks like once ids leave literal types.
    const sameAsMaker: unknown = opsA;
    expect(() =>
      approveModerationDecision(issued, sameAsMaker as typeof opsB, approveIn()),
    ).toThrow(MakerCheckerSameIdentityError);
  });

  it('DEBT ②: a hand-built IssuedCommand with a LYING maker envelope is refused at approve', () => {
    // Bypass issueModerationDecision()/issue() entirely — a raw object literal.
    const lying: IssuedCommand<'ops:moderation:diallo'> = {
      action: 'moderation:decide',
      reason: 'approved',
      entity: 'listing:x',
      maker: actor('ops:moderation:diallo'),
      envelope: {
        command_id: '00000000-0000-4000-8000-000000000000',
        correlation_id: 'c',
        aggregateVersion: 0,
        actor: 'ops:moderation:MALLORY', // the lie: envelope actor != maker.id
        serverTime: '2026-07-13T10:00:00.000Z',
        version: '1',
      },
    };
    const forged: IssuedModerationCommand<'ops:moderation:diallo'> = {
      command: lying,
      decision: approved('ops:moderation:diallo'),
      listingId: 'listing:x',
    };
    expect(() => approveModerationDecision(forged, opsB, approveIn())).toThrow(MakerCheckerError);
  });

  it('a reasonless changes_requested is unrepresentable (canon)', () => {
    const reasonless = {
      decision: 'changes_requested',
      reasons: [],
      decided_by: 'ops:moderation:diallo',
    } as unknown as ModerationDecision;
    expect(() => issueModerationDecision(opsA, issueIn(reasonless))).toThrow();
  });

  it('changes_requested carries its reason codes verbatim through issue and approve', () => {
    const issued = issueModerationDecision(opsA, issueIn(changes('ops:moderation:diallo')));
    expect(issued.decision).toMatchObject({
      decision: 'changes_requested',
      reasons: ['price_or_contact_in_image'],
    });
    const decided = approveModerationDecision(issued, opsB, approveIn());
    expect(decided.decision).toMatchObject({
      decision: 'changes_requested',
      reasons: ['price_or_contact_in_image'],
    });
  });
});
